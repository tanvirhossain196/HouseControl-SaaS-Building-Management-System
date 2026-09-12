import { NextResponse, type NextRequest } from 'next/server'

import { requireUser, createServerSupabase } from '@/lib/supabase/server'
import { fail } from '@/lib/api/response'
import { notFound, conflict } from '@/lib/errors'
import { periodLabel, daysInPeriod } from '@/lib/billing'
import { formatDay } from '@/lib/subscription'
import { buildInvoicePdf, type InvoiceData } from '@/lib/invoice'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const METHODS: Record<string, string> = {
  bkash: 'bKash',
  nagad: 'Nagad',
  bank_transfer: 'Bank transfer',
  cash: 'Cash',
  card: 'Card',
  other: 'Other',
}

/** The whole calendar month the rent covers — not the moderator's deadline. */
function monthRange(period: string) {
  const start = `${period.slice(0, 7)}-01`
  const end = `${period.slice(0, 7)}-${String(daysInPeriod(period)).padStart(2, '0')}`
  return { start, end }
}

/**
 * The receipt for one confirmed handover.
 *
 * Proof for the moderator that the owner accepted the money — the thing they
 * point at when a figure is disputed months later. It exists only once the
 * owner has confirmed, because a receipt for money nobody has acknowledged
 * receiving is worth less than nothing.
 *
 * Access is decided by RLS: the query runs as the signed-in person, and the
 * policies admit the moderator who paid and the admins of the building.
 *
 * Two dates appear, and the difference between them matters. "Handed over" is
 * the day the moderator says the money changed hands; "confirmed" is the day
 * the owner agreed. A dispute is almost always about the gap between the two.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { paymentId: string } },
) {
  try {
    const user = await requireUser()
    const supabase = createServerSupabase()

    const { data: payment, error } = await supabase
      .from('remittance_payments')
      .select(
        'id, remittance_id, amount, method, paid_at, reference, status, receipt_no, reviewed_at, reviewed_by',
      )
      .eq('id', params.paymentId)
      .maybeSingle()

    if (error) throw error
    if (!payment) throw notFound('That receipt')

    if (payment.status !== 'confirmed' || !payment.receipt_no) {
      throw conflict('A receipt exists only once the owner has confirmed the handover.')
    }

    const { data: remittance } = await supabase
      .from('remittances')
      .select('building_id, moderator_id, period, amount, flat_count')
      .eq('id', payment.remittance_id)
      .maybeSingle()

    if (!remittance) throw notFound('That handover')

    // Separate reads: remittances points at profiles twice — moderator_id and
    // created_by — so an embedded select cannot be resolved.
    const [{ data: building }, { data: moderator }, { data: reviewer }] =
      await Promise.all([
        supabase
          .from('buildings')
          .select('name, address_line, area, city')
          .eq('id', remittance.building_id)
          .maybeSingle(),
        supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', remittance.moderator_id)
          .maybeSingle(),
        payment.reviewed_by
          ? supabase
              .from('profiles')
              .select('full_name')
              .eq('id', payment.reviewed_by)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ])

    const amount = Number(payment.amount)
    const month = periodLabel(remittance.period)
    const { start, end } = monthRange(remittance.period)
    const flats = Number(remittance.flat_count ?? 0)

    const address = building
      ? [building.address_line, building.area, building.city].filter(Boolean).join(', ')
      : ''

    const receipt: InvoiceData = {
      kind: 'receipt',
      subtitle: 'Rent handover',
      invoiceNo: payment.receipt_no,
      transactionId: payment.reference ?? '—',
      // The day the money changed hands, not the day it was signed off.
      issuedOn: payment.paid_at,
      partyLabel: 'RECEIVED FROM',
      planName: month,
      months: 1,
      amount,
      listPrice: amount,
      discountPercent: 0,
      organisation: address || (building?.name ?? ''),
      billedTo: moderator?.full_name ?? 'Moderator',
      email: moderator?.email ?? user.email ?? '—',
      method: METHODS[payment.method] ?? String(payment.method),
      gatewayReference: building?.name ?? null,
      lineDescription: `Rent collected for ${month}${
        flats > 0 ? `, ${flats} flat${flats === 1 ? '' : 's'}` : ''
      }`,
      coverage: `${formatDay(start)} to ${formatDay(end)}`,
      periodStart: start,
      periodEnd: end,
      extraDetails: [
        ['Handed over', formatDay(payment.paid_at)],
        [
          'Confirmed',
          payment.reviewed_at
            ? formatDay(payment.reviewed_at.slice(0, 10))
            : formatDay(payment.paid_at),
        ],
        ['Confirmed by', reviewer?.full_name ?? 'The owner'],
      ],
      notes: [
        `Received in full. ${
          reviewer?.full_name ?? 'The owner'
        } has confirmed this handover.`,
        'Generated by HouseControl. No signature is required.',
        `Questions about this receipt? Quote ${payment.receipt_no}.`,
      ],
    }

    const bytes = await buildInvoicePdf(receipt)

    return new NextResponse(bytes as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${payment.receipt_no}.pdf"`,
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (error) {
    return fail(error)
  }
}
