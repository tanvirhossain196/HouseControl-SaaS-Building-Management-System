import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/supabase/server'
import { fail } from '@/lib/api/response'
import { AppError } from '@/lib/errors'
import { periodOf } from '@/lib/billing'
import { reportFilename, toCsv } from '@/lib/reports'
import { arrearsByFlat, expenseBreakdown, ledgerRows } from '@/services/reports.service'

/**
 * CSV exports.
 *
 * Access is decided by RLS — every query runs as the signed-in user, so an
 * owner's export covers their organization and a moderator's covers their
 * flat. There is no permission check here because there is no way to widen
 * the query.
 *
 * `toCsv` neutralises cells that a spreadsheet would treat as a formula. An
 * export is opened in Excel by a person who trusts it, which is exactly the
 * situation CSV injection is built for.
 */
const KINDS = ['ledger', 'arrears', 'expenses'] as const
type Kind = (typeof KINDS)[number]

export async function GET(
  request: NextRequest,
  { params }: { params: { kind: string } },
) {
  try {
    await requireUser()

    if (!KINDS.includes(params.kind as Kind)) {
      throw new AppError('not_found', 'No such report.')
    }

    const requested = request.nextUrl.searchParams.get('period')
    const period = /^\d{4}-\d{2}-01$/.test(requested ?? '') ? requested! : periodOf()

    // The scope names the organisation on the filename, so an owner with two
    // buildings does not end up with two files called the same thing.
    const scope = request.nextUrl.searchParams.get('scope') ?? 'all'
    let csv: string

    if (params.kind === 'ledger') {
      const rows = await ledgerRows(period)
      csv = toCsv(
        [
          'Due date',
          'Unit',
          'Resident',
          'Description',
          'Charged',
          'Paid',
          'Status',
          'Receipt',
        ],
        rows.map((row) => [
          row.date,
          row.unit,
          row.resident,
          row.description,
          row.charged,
          row.paid,
          row.status,
          row.receipt,
        ]),
      )
    } else if (params.kind === 'arrears') {
      const rows = await arrearsByFlat()
      csv = toCsv(
        ['Unit', 'Building', 'Outstanding', 'Owed since'],
        rows.map((row) => [
          row.unitNumber,
          row.buildingName,
          row.outstanding,
          row.oldestDueDate ?? '',
        ]),
      )
    } else {
      const rows = await expenseBreakdown(period)
      csv = toCsv(
        ['Category', 'Items', 'Total'],
        rows.map((row) => [row.category, row.count, row.total]),
      )
    }

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${reportFilename(params.kind, scope, period)}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    return fail(error)
  }
}

export const dynamic = 'force-dynamic'
