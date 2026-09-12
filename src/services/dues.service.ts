import 'server-only'

import { createServerSupabase } from '@/lib/supabase/server'
import { AppError, conflict, notFound, toAppError } from '@/lib/errors'
import { writeAuditLog } from './audit.service'
import { raiseRemittances, type RaiseResult } from './remittances.service'
import { getFlat, type Db } from './flats.service'
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
    .select('*, resident:profiles!user_id(full_name)')
    .eq('flat_id', flatId)
    .order('due_date', { ascending: false })
    .limit(200)

  if (period) query = query.eq('period', period)

  const { data, error } = await query
  if (error) throw toAppError(error)

  // Embedded selects are not expressible in the hand-written Database type.
  const rows = (data ?? []) as unknown as (DueRow & {
    resident: { full_name: string } | null
  })[]
  return rows.map((row) => ({ ...row, residentName: row.resident?.full_name ?? null }))
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
  /** Null when the nightly job raised it — nobody decided anything. */
  actorId: string | null,
  flatId: string,
  period: string = periodOf(),
  db?: Db,
): Promise<BillResult> {
  const supabase = db ?? createServerSupabase()
  const flat = await getFlat(flatId, db)
  const residents = await listResidents(flatId, db)

  const rent = Number(flat.monthly_rent)
  if (rent <= 0) {
    throw conflict(
      `Flat ${flat.unit_number} has no rent set, so there is nothing to bill.`,
    )
  }
  if (residents.length === 0) {
    throw conflict(`Flat ${flat.unit_number} has nobody living in it this month.`)
  }

  /**
   * Rent falls due the day it is billed, not on a fixed day of the month.
   *
   * A landlord who bills on the 7th has not given anyone a bill for the 5th,
   * and dating it backwards would show residents as late for days they were
   * never told about. The ten-day grace in latenessOf() is what turns "due"
   * into "overdue" after that.
   */
  const dueDate = todayInDhaka()
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
    /** Null when the nightly job raised the charge rather than a person. */
    created_by: string | null
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

  /**
   * Read first, then insert only what is missing.
   *
   * An upsert would be shorter, but dues_unique_per_source_period is built on
   * expressions — coalesce(user_id, ...) and coalesce(source_id, ...) — and
   * Postgres will not accept an expression index as an ON CONFLICT arbiter from
   * a plain column list. It raised 42P10 every time, and the caller's catch
   * turned that into "could not be billed" and moved on, so rent quietly stopped
   * being billed at all while the remittance ledger beside it kept working.
   *
   * Looking the month up first gives the same protection against double billing
   * without asking the planner to infer anything.
   */
  const { data: existing, error: existingError } = await supabase
    .from('dues')
    .select('user_id')
    .eq('flat_id', flatId)
    .eq('period', period)
    .eq('source', 'rent')
    .is('source_id', null)

  if (existingError) throw toAppError(existingError)

  const alreadyBilled = new Set((existing ?? []).map((row) => row.user_id))
  const missing = rows.filter((row) => !alreadyBilled.has(row.user_id))

  let created = 0

  if (missing.length > 0) {
    const { data, error } = await supabase.from('dues').insert(missing).select('id')

    if (error) throw toAppError(error)

    created = data?.length ?? 0
  }

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
  /** What each moderator now owes the owner for this month. */
  remittances: RaiseResult | null
  remittanceError: string | null
}

/** Bills every occupied flat in a building. Flats that cannot be billed are named. */
export async function billBuildingRent(
  /** Null when the nightly job raised it — nobody decided anything. */
  actorId: string | null,
  buildingId: string,
  period: string = periodOf(),
  /** The owner's deadline for the moderators. Defaults to the last rent day. */
  remitDueDate?: string,
  db?: Db,
): Promise<BuildingBillResult> {
  const supabase = db ?? createServerSupabase()

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
      const result = await billFlatRent(actorId, flat.id, period, db)
      billed += 1
      created += result.created
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'could not be billed'

      /**
       * The full error to the server log, the tidy one to the caller.
       *
       * toAppError turns anything it does not recognise into "Something went
       * wrong on our side", which is the right thing to show a landlord and
       * useless to whoever has to fix it. Without this line the original —
       * usually a Postgres constraint with a name in it — is thrown away.
       */
      console.error('[bill] flat', flat.unit_number, flat.id, cause)

      skipped.push(`${flat.unit_number}: ${message}`)
    }
  }

  /**
   * The second ledger is raised in the same breath as the first.
   *
   * Residents owing rent while no moderator owes anything would be a hole in
   * the accounts that nobody notices until the month is over. A failure here is
   * reported alongside the billing result rather than thrown: the rent has
   * already been billed by this point, and unwinding it to complain about the
   * remittances would be worse than saying what went wrong.
   */
  let remittances: RaiseResult | null = null
  let remittanceError: string | null = null

  try {
    remittances = await raiseRemittances(actorId, buildingId, period, remitDueDate, db)
  } catch (cause) {
    remittanceError =
      cause instanceof Error ? cause.message : 'Remittances could not be raised.'
  }

  await writeAuditLog({
    actorId,
    action: 'dues.billed_building',
    entityType: 'building',
    entityId: buildingId,
    after: {
      period,
      flats: billed,
      dues: created,
      skipped: skipped.length,
      remittances: remittances?.created ?? 0,
    },
  })

  return { billed, created, skipped, remittances, remittanceError }
}

/**
 * The moderator sets the rent day for a flat they run.
 *
 * Two separate effects, because they are two separate decisions and conflating
 * them is how a landlord ends up surprised:
 *
 *   the flat's rent_due_day    every month billed from now on
 *   applyToOpenDues            this month's charges that are still unpaid
 *
 * Paid and partly-paid charges are never touched. Moving the date on money that
 * has already changed hands rewrites history, and a resident who paid on time
 * would suddenly appear to have paid late, or the reverse.
 */
export async function updateRentSchedule(
  actorId: string,
  flatId: string,
  input: {
    rentDueDay: number
    applyToOpenDues: boolean
    period?: string
  },
): Promise<{ dueDay: number; duesMoved: number }> {
  const supabase = createServerSupabase()
  const flat = await getFlat(flatId)

  const day = Math.min(28, Math.max(1, Math.round(input.rentDueDay)))

  const { error: flatError } = await supabase
    .from('flats')
    .update({ rent_due_day: day })
    .eq('id', flatId)

  if (flatError) throw toAppError(flatError)

  let duesMoved = 0

  if (input.applyToOpenDues) {
    const period = input.period ?? periodOf()

    /**
     * Moving open charges still honours the chosen day, because here the
     * landlord is deliberately naming a date rather than billing. Charges that
     * have been paid against are never touched — see below.
     */
    const dueDate = dueDateFor(period, day)

    const { data: moved, error: dueError } = await supabase
      .from('dues')
      .update({ due_date: dueDate })
      .eq('flat_id', flatId)
      .eq('period', period)
      .eq('status', 'open')
      .select('id')

    if (dueError) throw toAppError(dueError)
    duesMoved = moved?.length ?? 0
  }

  await writeAuditLog({
    actorId,
    action: 'flat.rent_day_changed',
    entityType: 'flat',
    entityId: flatId,
    before: { rentDueDay: flat.rent_due_day },
    after: { rentDueDay: day, duesMoved },
  })

  return { dueDay: day, duesMoved }
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