import 'server-only'

import { createServerSupabase } from '@/lib/supabase/server'
import { AppError, conflict, notFound, toAppError } from '@/lib/errors'
import { writeAuditLog } from './audit.service'
import { getFlat } from './flats.service'
import { listResidents } from './residents.service'
import { dueDateFor, outstandingOf, periodOf, todayInDhaka } from '@/lib/billing'
import type { DueRow } from '@/types'

/**
 * The dues ledger.
 *
 * A due is one person's obligation for one thing in one month. Rent, a share
 * of the gas bill and a penalty are three rows, never one blended balance —
 * that is what lets a receipt say what it actually paid for.
 *
 * `amount_paid` and `status` are written by a database trigger from confirmed
 * payments. Nothing in this file touches them.
 */

export type DueWithWho = DueRow & { residentName: string | null }

export async function listFlatDues(
  flatId: string,
  period?: string,
): Promise<DueWithWho[]> {
  const supabase = createServerSupabase()

  let query = supabase
    .from('dues')
    .select('*, profiles(full_name)')
    .eq('flat_id', flatId)
    .order('due_date', { ascending: false })
    .limit(200)

  if (period) query = query.eq('period', period)

  const { data, error } = await query
  if (error) throw toAppError(error)

  // Embedded selects are not expressible in the hand-written Database type.
  const rows = (data ?? []) as unknown as (DueRow & {
    profiles: { full_name: string } | null
  })[]
  return rows.map((row) => ({ ...row, residentName: row.profiles?.full_name ?? null }))
}

/** Everything one person owes, oldest first, across every flat they are in. */
export async function listOpenDuesForUser(userId: string): Promise<DueRow[]> {
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('dues')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['open', 'partially_paid'])
    .order('due_date', { ascending: true })

  if (error) throw toAppError(error)
  return data
}

export async function listDuesForUser(userId: string, limit = 60): Promise<DueRow[]> {
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('dues')
    .select('*')
    .eq('user_id', userId)
    .order('due_date', { ascending: false })
    .limit(limit)

  if (error) throw toAppError(error)
  return data
}

export async function getDue(dueId: string): Promise<DueRow> {
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('dues')
    .select('*')
    .eq('id', dueId)
    .maybeSingle()

  if (error) throw toAppError(error)
  if (!data) throw notFound('That charge')
  return data
}

export type BillResult = {
  created: number
  skipped: number
  total: number
  unassigned: number
}

/**
 * Bills one flat's rent for a month.
 *
 * One due per resident, sized by their rent share. Running it twice does
 * nothing the second time — the unique index on
 * (flat, resident, source, period) makes that the database's job rather than
 * a check that can race.
 *
 * If the shares do not add up to the flat's rent, the shortfall is billed to
 * the flat itself rather than silently dropped, so the money still appears on
 * the building's books.
 */
export async function billFlatRent(
  actorId: string,
  flatId: string,
  period: string = periodOf(),
): Promise<BillResult> {
  const supabase = createServerSupabase()
  const flat = await getFlat(flatId)
  const residents = await listResidents(flatId)

  const rent = Number(flat.monthly_rent)
  if (rent <= 0) {
    throw conflict(
      `Flat ${flat.unit_number} has no rent set, so there is nothing to bill.`,
    )
  }
  if (residents.length === 0) {
    throw conflict(`Flat ${flat.unit_number} has nobody living in it this month.`)
  }

  const dueDate = dueDateFor(period, flat.rent_due_day)
  const assigned = residents.reduce((sum, resident) => sum + resident.rentShare, 0)
  const unassigned = Math.round((rent - assigned) * 100) / 100

  type DueInsert = {
    flat_id: string
    user_id: string | null
    source: 'rent'
    period: string
    amount: number
    due_date: string
    description: string
    created_by: string
  }

  const rows: DueInsert[] = residents
    .filter((resident) => resident.rentShare > 0)
    .map((resident) => ({
      flat_id: flatId,
      user_id: resident.userId,
      source: 'rent',
      period,
      amount: resident.rentShare,
      due_date: dueDate,
      description: `Rent for ${period.slice(0, 7)}`,
      created_by: actorId,
    }))

  if (unassigned > 0) {
    rows.push({
      flat_id: flatId,
      user_id: null,
      source: 'rent',
      period,
      amount: unassigned,
      due_date: dueDate,
      description: `Unassigned rent for ${period.slice(0, 7)}`,
      created_by: actorId,
    })
  }

  if (rows.length === 0) {
    throw conflict('Nobody in this flat has a rent share yet.')
  }

  // ignoreDuplicates leaves already-billed rows exactly as they are, including
  // any payments made against them.
  const { data, error } = await supabase
    .from('dues')
    .upsert(rows, {
      onConflict: 'flat_id,user_id,source,source_id,period',
      ignoreDuplicates: true,
    })
    .select('id')

  if (error) throw toAppError(error)

  const created = data?.length ?? 0

  if (created > 0) {
    await writeAuditLog({
      actorId,
      action: 'dues.billed',
      entityType: 'flat',
      entityId: flatId,
      after: { period, created, total: rent },
    })
  }

  return { created, skipped: rows.length - created, total: rent, unassigned }
}

export type BuildingBillResult = {
  billed: number
  created: number
  skipped: string[]
}

/** Bills every occupied flat in a building. Flats that cannot be billed are named. */
export async function billBuildingRent(
  actorId: string,
  buildingId: string,
  period: string = periodOf(),
): Promise<BuildingBillResult> {
  const supabase = createServerSupabase()

  const { data: flats, error } = await supabase
    .from('flats')
    .select('id, unit_number')
    .eq('building_id', buildingId)
    .eq('occupancy_status', 'occupied')
    .is('archived_at', null)

  if (error) throw toAppError(error)
  if (!flats?.length) throw conflict('No occupied flats in this building.')

  let billed = 0
  let created = 0
  const skipped: string[] = []

  for (const flat of flats) {
    try {
      const result = await billFlatRent(actorId, flat.id, period)
      billed += 1
      created += result.created
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'could not be billed'
      skipped.push(`${flat.unit_number}: ${message}`)
    }
  }

  await writeAuditLog({
    actorId,
    action: 'dues.billed_building',
    entityType: 'building',
    entityId: buildingId,
    after: { period, flats: billed, dues: created, skipped: skipped.length },
  })

  return { billed, created, skipped }
}

/**
 * Writes off a charge.
 *
 * Waiving is not deleting: the row stays, its status becomes `waived`, and the
 * reason is on the audit trail. A due with money already paid against it
 * cannot be waived — that would strand the payment.
 */
export async function waiveDue(
  actorId: string,
  dueId: string,
  reason: string,
): Promise<void> {
  const supabase = createServerSupabase()
  const due = await getDue(dueId)

  if (Number(due.amount_paid) > 0) {
    throw conflict('Money has already been paid against this charge. Refund it instead.')
  }
  if (due.status === 'waived') throw conflict('This charge is already waived.')

  const { error } = await supabase
    .from('dues')
    .update({ status: 'waived' })
    .eq('id', dueId)
  if (error) throw toAppError(error)

  await writeAuditLog({
    actorId,
    action: 'due.waived',
    entityType: 'due',
    entityId: dueId,
    before: { amount: due.amount, status: due.status },
    after: { reason },
  })
}

/** Adds a one-off charge — a penalty, a repair the resident agreed to pay. */
export async function addCharge(
  actorId: string,
  input: {
    flatId: string
    userId?: string
    amount: number
    description: string
    dueDate: string
    source: 'penalty' | 'other' | 'utility'
    period?: string
  },
): Promise<DueRow> {
  const supabase = createServerSupabase()

  if (input.amount <= 0) throw new AppError('bad_request', 'Enter an amount above zero.')

  const { data, error } = await supabase
    .from('dues')
    .insert({
      flat_id: input.flatId,
      user_id: input.userId ?? null,
      source: input.source,
      period: input.period ?? periodOf(input.dueDate),
      amount: input.amount,
      due_date: input.dueDate,
      description: input.description,
      created_by: actorId,
    })
    .select('*')
    .single()

  if (error) throw toAppError(error)

  await writeAuditLog({
    actorId,
    action: 'due.added',
    entityType: 'due',
    entityId: data.id,
    after: { amount: data.amount, description: data.description },
  })

  return data
}

/** Days until a due date; negative means overdue. */
export function daysUntil(
  dueDate: string,
  today: string | Date = todayInDhaka(),
): number {
  const from = typeof today === 'string' ? today : todayInDhaka(today)
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${dueDate}T00:00:00Z`)
  if (Number.isNaN(start) || Number.isNaN(end)) return 0
  return Math.round((end - start) / 86_400_000)
}

export type DuesSummary = {
  billed: number
  collected: number
  outstanding: number
  overdueCount: number
}

/** Collection progress for one flat in one month. */
export async function summariseFlatMonth(
  flatId: string,
  period: string,
): Promise<DuesSummary> {
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('dues')
    .select('amount, amount_paid, due_date, status')
    .eq('flat_id', flatId)
    .eq('period', period)

  if (error) throw toAppError(error)

  const today = todayInDhaka()

  return data.reduce<DuesSummary>(
    (summary, due) => {
      summary.billed += Number(due.amount)
      summary.collected += Number(due.amount_paid)
      summary.outstanding += outstandingOf({
        amount: Number(due.amount),
        amountPaid: Number(due.amount_paid),
        dueDate: due.due_date,
        status: due.status,
      })
      if (due.status !== 'paid' && due.due_date < today) summary.overdueCount += 1
      return summary
    },
    { billed: 0, collected: 0, outstanding: 0, overdueCount: 0 },
  )
}
