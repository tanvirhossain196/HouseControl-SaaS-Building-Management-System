import 'server-only'

import { createServerSupabase } from '@/lib/supabase/server'
import { conflict, forbidden, notFound, toAppError, AppError } from '@/lib/errors'
import { writeAuditLog } from './audit.service'
import { dueDateFor, periodOf, receiptNumber } from '@/lib/billing'
import type { Db } from './flats.service'
import type { RemittanceRow, RemittancePaymentRow } from '@/types'

/**
 * The second hop: what a moderator owes the owner.
 *
 * A resident pays their moderator, and the moderator pays the owner. The first
 * hop lives in dues.service; this is the second, deliberately built the same
 * way — a charge raised before any money moves, a submission that waits for
 * review, and a database trigger as the only thing that touches a balance.
 *
 * The amount is the full rent of the flats the moderator covers, taken from the
 * rent roll at billing time. It is not the sum of what the residents actually
 * paid. That is the whole point of the arrangement: the moderator answers for
 * the rent and chases the arrears themselves.
 */

/**
 * The row shapes live in the Database type, not here.
 *
 * Supabase types every query against that map, so a second definition in this
 * file would not be checked against the first — it would just drift until a
 * column rename passed the compiler and failed at runtime.
 */
export type { RemittanceRow, RemittancePaymentRow } from '@/types'

export type RaiseResult = {
  created: number
  skipped: number
  unmanagedFlats: string[]
}

/**
 * Raises one remittance per moderator for a building and month.
 *
 * Called straight after the rent is billed, so the two ledgers are always
 * created together — a month where residents owe rent but no moderator owes
 * anything would be a silent hole in the accounts.
 *
 * Flats with no active moderator are named in the result rather than swallowed.
 * Their rent belongs to nobody in this ledger, and the owner needs to know that
 * before wondering why the totals do not add up.
 */
export async function raiseRemittances(
  /** Null when raised by the nightly job rather than by a person. */
  actorId: string | null,
  buildingId: string,
  period: string = periodOf(),
  overrideDueDate?: string,
  db?: Db,
): Promise<RaiseResult> {
  const supabase = db ?? createServerSupabase()

  const { data: flats, error } = await supabase
    .from('flats')
    .select('id, unit_number, monthly_rent, rent_due_day')
    .eq('building_id', buildingId)
    .eq('occupancy_status', 'occupied')
    .is('archived_at', null)

  if (error) throw toAppError(error)
  if (!flats?.length) throw conflict('No occupied flats in this building.')

  const flatIds = flats.map((flat) => flat.id)

  const { data: moderators, error: moderatorError } = await supabase
    .from('flat_members')
    .select('flat_id, user_id')
    .in('flat_id', flatIds)
    .eq('role', 'moderator')
    .eq('status', 'active')

  if (moderatorError) throw toAppError(moderatorError)

  type Bucket = { amount: number; flats: number; lastDueDate: string }
  const byModerator = new Map<string, Bucket>()
  const unmanagedFlats: string[] = []

  for (const flat of flats) {
    const rent = Number(flat.monthly_rent)
    if (rent <= 0) continue

    const owners = (moderators ?? []).filter((row) => row.flat_id === flat.id)

    if (owners.length === 0) {
      unmanagedFlats.push(flat.unit_number)
      continue
    }

    const dueDate = dueDateFor(period, flat.rent_due_day)

    for (const owner of owners) {
      const bucket = byModerator.get(owner.user_id) ?? {
        amount: 0,
        flats: 0,
        lastDueDate: dueDate,
      }

      // Several moderators on one flat would each answer for the whole rent,
      // which nobody intends. Split it, so the building's total still balances.
      bucket.amount += rent / owners.length
      bucket.flats += 1

      // The moderator is due on the day the last of their residents is due.
      if (dueDate > bucket.lastDueDate) bucket.lastDueDate = dueDate

      byModerator.set(owner.user_id, bucket)
    }
  }

  if (byModerator.size === 0) {
    throw conflict(
      'No flat in this building has an active moderator, so there is nobody to remit.',
    )
  }

  const rows = [...byModerator.entries()].map(([moderatorId, bucket]) => ({
    building_id: buildingId,
    moderator_id: moderatorId,
    period,
    amount: Math.round(bucket.amount * 100) / 100,
    due_date: overrideDueDate ?? bucket.lastDueDate,
    flat_count: bucket.flats,
    created_by: actorId,
  }))

  // ignoreDuplicates leaves an already-raised month exactly as it is, payments
  // and all. Billing twice is a normal mistake and must be harmless.
  const { data: inserted, error: insertError } = await supabase
    .from('remittances')
    .upsert(rows, {
      onConflict: 'building_id,moderator_id,period',
      ignoreDuplicates: true,
    })
    .select('id')

  if (insertError) throw toAppError(insertError)

  const created = inserted?.length ?? 0

  if (created > 0) {
    await writeAuditLog({
      actorId,
      action: 'remittances.raised',
      entityType: 'building',
      entityId: buildingId,
      after: { period, created, moderators: rows.length },
    })
  }

  return { created, skipped: rows.length - created, unmanagedFlats }
}

/** Everything a moderator owes, newest month first. */
export async function listRemittancesForModerator(
  userId: string,
  limit = 24,
): Promise<RemittanceRow[]> {
  const supabase = createServerSupabase()

  const { data, error } = await supabase
    .from('remittances')
    .select('*')
    .eq('moderator_id', userId)
    .order('period', { ascending: false })
    .limit(limit)

  if (error) throw toAppError(error)
  return (data ?? []) as RemittanceRow[]
}

/** Every remittance in a building — the owner's view of who owes what. */
export async function listRemittancesForBuilding(
  buildingId: string,
  limit = 60,
): Promise<RemittanceRow[]> {
  const supabase = createServerSupabase()

  const { data, error } = await supabase
    .from('remittances')
    .select('*')
    .eq('building_id', buildingId)
    .order('period', { ascending: false })
    .limit(limit)

  if (error) throw toAppError(error)
  return (data ?? []) as RemittanceRow[]
}

export async function getRemittance(remittanceId: string): Promise<RemittanceRow> {
  const supabase = createServerSupabase()

  const { data, error } = await supabase
    .from('remittances')
    .select('*')
    .eq('id', remittanceId)
    .maybeSingle()

  if (error) throw toAppError(error)
  if (!data) throw notFound('That remittance')

  return data as RemittanceRow
}

export type RemittanceSubmission = RemittancePaymentRow & {
  remittance: RemittanceRow
  moderatorName: string
  buildingName: string
}

/**
 * The owner's review queue.
 *
 * Assembled from four plain queries rather than one embedded select. Both
 * `moderator_id` and `created_by` point at profiles, so PostgREST cannot tell
 * which relationship `profiles(...)` means and refuses the embed — the same
 * trap that silently killed the invoice email. Separate reads cannot become
 * ambiguous.
 *
 * No filtering by organization here: RLS already limits these rows to
 * buildings the caller administers.
 */
export async function listPendingRemittancePayments(
  limit = 50,
): Promise<RemittanceSubmission[]> {
  const supabase = createServerSupabase()

  const { data: payments, error } = await supabase
    .from('remittance_payments')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) throw toAppError(error)
  if (!payments?.length) return []

  const remittanceIds = [...new Set(payments.map((row) => row.remittance_id))]

  const { data: remittances } = await supabase
    .from('remittances')
    .select('*')
    .in('id', remittanceIds)

  const byId = new Map((remittances ?? []).map((row) => [row.id, row as RemittanceRow]))

  const moderatorIds = [...new Set((remittances ?? []).map((row) => row.moderator_id))]
  const buildingIds = [...new Set((remittances ?? []).map((row) => row.building_id))]

  const [{ data: profiles }, { data: buildings }] = await Promise.all([
    supabase.from('profiles').select('id, full_name').in('id', moderatorIds),
    supabase.from('buildings').select('id, name').in('id', buildingIds),
  ])

  const names = new Map((profiles ?? []).map((row) => [row.id, row.full_name]))
  const buildingNames = new Map((buildings ?? []).map((row) => [row.id, row.name]))

  return payments
    .map((payment) => {
      const remittance = byId.get(payment.remittance_id)
      if (!remittance) return null

      return {
        ...(payment as RemittancePaymentRow),
        remittance,
        moderatorName: names.get(remittance.moderator_id) ?? 'Moderator',
        buildingName: buildingNames.get(remittance.building_id) ?? 'Building',
      }
    })
    .filter((row): row is RemittanceSubmission => row !== null)
}

/**
 * The owner moves a deadline.
 *
 * Only the date changes. Rewriting the amount here would let a month be quietly
 * reduced after the fact, which is what the audit log exists to make impossible
 * to do unnoticed — so the amount stays fixed to what was billed, and a wrong
 * amount is corrected by waiving and re-billing instead.
 *
 * A settled month is left alone. Moving a date on something already paid says
 * nothing true and only confuses the record.
 */
export async function updateRemittanceDueDate(
  actorId: string,
  remittanceId: string,
  dueDate: string,
): Promise<void> {
  const supabase = createServerSupabase()
  const before = await getRemittance(remittanceId)

  if (before.status === 'paid' || before.status === 'waived') {
    throw conflict('That month is closed. There is no deadline left to move.')
  }

  if (before.due_date === dueDate) return

  const { error } = await supabase
    .from('remittances')
    .update({ due_date: dueDate })
    .eq('id', remittanceId)

  if (error) throw toAppError(error)

  await writeAuditLog({
    actorId,
    action: 'remittance.date_changed',
    entityType: 'remittance',
    entityId: remittanceId,
    before: { dueDate: before.due_date },
    after: { dueDate },
  })
}

export type BuildingRemittance = RemittanceRow & { moderatorName: string }

/** The owner's schedule for one building: who owes what, and by when. */
export async function listBuildingRemittances(
  buildingId: string,
  limit = 24,
): Promise<BuildingRemittance[]> {
  const supabase = createServerSupabase()
  const rows = await listRemittancesForBuilding(buildingId, limit)

  if (rows.length === 0) return []

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', [...new Set(rows.map((row) => row.moderator_id))])

  const names = new Map((profiles ?? []).map((row) => [row.id, row.full_name]))

  return rows.map((row) => ({
    ...row,
    moderatorName: names.get(row.moderator_id) ?? 'Moderator',
  }))
}

export type ModeratorRemittanceRow = RemittanceRow & {
  buildingName: string
  /** Confirmed handovers only — the ones with a receipt to show. */
  receipts: Array<{ id: string; amount: number; paidAt: string; receiptNo: string }>
}

/** A moderator's own list, with the building named and its receipts attached. */
export async function listModeratorRemittances(
  userId: string,
  limit = 24,
): Promise<ModeratorRemittanceRow[]> {
  const supabase = createServerSupabase()
  const rows = await listRemittancesForModerator(userId, limit)

  if (rows.length === 0) return []

  const [{ data: buildings }, { data: payments }] = await Promise.all([
    supabase
      .from('buildings')
      .select('id, name')
      .in('id', [...new Set(rows.map((row) => row.building_id))]),
    supabase
      .from('remittance_payments')
      .select('id, remittance_id, amount, paid_at, receipt_no')
      .in('remittance_id', rows.map((row) => row.id))
      .eq('status', 'confirmed')
      .order('paid_at', { ascending: false }),
  ])

  const names = new Map((buildings ?? []).map((row) => [row.id, row.name]))

  return rows.map((row) => ({
    ...row,
    buildingName: names.get(row.building_id) ?? 'Building',
    receipts: (payments ?? [])
      .filter((payment) => payment.remittance_id === row.id && payment.receipt_no)
      .map((payment) => ({
        id: payment.id,
        amount: Number(payment.amount),
        paidAt: payment.paid_at,
        receiptNo: payment.receipt_no as string,
      })),
  }))
}

export async function listRemittancePayments(
  remittanceId: string,
): Promise<RemittancePaymentRow[]> {
  const supabase = createServerSupabase()

  const { data, error } = await supabase
    .from('remittance_payments')
    .select('*')
    .eq('remittance_id', remittanceId)
    .order('created_at', { ascending: false })

  if (error) throw toAppError(error)
  return (data ?? []) as RemittancePaymentRow[]
}

/**
 * The moderator records a handover.
 *
 * Nothing is settled here. The row is written as pending and the balance does
 * not move until the owner confirms it, which is the same rule residents live
 * under one level down.
 */
export async function submitRemittancePayment(
  userId: string,
  input: {
    remittanceId: string
    amount: number
    method: 'cash' | 'bkash' | 'nagad' | 'bank_transfer' | 'card' | 'other'
    paidAt?: string
    reference?: string
    note?: string
  },
): Promise<RemittancePaymentRow> {
  const supabase = createServerSupabase()
  const remittance = await getRemittance(input.remittanceId)

  if (remittance.moderator_id !== userId) {
    throw forbidden('That remittance is not yours to pay.')
  }

  if (remittance.status === 'waived') {
    throw conflict('That remittance has been waived.')
  }

  if (input.amount <= 0) {
    throw new AppError('bad_request', 'Enter an amount above zero.')
  }

  const outstanding =
    Math.round((Number(remittance.amount) - Number(remittance.amount_paid)) * 100) / 100

  if (outstanding <= 0) {
    throw conflict('That month is already settled.')
  }

  if (input.amount > outstanding) {
    throw new AppError(
      'bad_request',
      `That is more than the ${outstanding} still outstanding.`,
    )
  }

  const { data, error } = await supabase
    .from('remittance_payments')
    .insert({
      remittance_id: input.remittanceId,
      paid_by: userId,
      amount: input.amount,
      method: input.method,
      status: 'pending',
      paid_at: input.paidAt ?? new Date().toISOString().slice(0, 10),
      reference: input.reference ?? null,
      note: input.note ?? null,
    })
    .select('*')
    .single()

  if (error) throw toAppError(error)

  await writeAuditLog({
    actorId: userId,
    action: 'remittance.submitted',
    entityType: 'remittance',
    entityId: input.remittanceId,
    after: { amount: input.amount, method: input.method },
  })

  return data as RemittancePaymentRow
}

/**
 * The next handover receipt number for a month.
 *
 * Its own HR- series, counted separately from rent receipts. Sharing a sequence
 * would mean a number alone could not tell you whether it belonged to a
 * tenant's rent or a moderator's handover.
 */
async function nextHandoverReceipt(period: string): Promise<string> {
  const supabase = createServerSupabase()
  const prefix = `HR-${period.slice(2, 4)}${period.slice(5, 7)}-`

  const { count } = await supabase
    .from('remittance_payments')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'confirmed')
    .like('receipt_no', `${prefix}%`)

  return `${prefix}${String((count ?? 0) + 1).padStart(4, '0')}`
}

/**
 * The owner accepts it.
 *
 * A receipt number is issued here, in the same statement that confirms — the
 * two are one fact, and a confirmed handover with no receipt would be a row the
 * moderator cannot prove anything with. The balance itself is moved by the
 * trigger, not by this function.
 */
export async function confirmRemittancePayment(
  actorId: string,
  paymentId: string,
): Promise<string> {
  const supabase = createServerSupabase()

  const { data: payment } = await supabase
    .from('remittance_payments')
    .select('id, remittance_id, amount, status')
    .eq('id', paymentId)
    .maybeSingle()

  if (!payment) throw notFound('That handover')
  if (payment.status !== 'pending') {
    throw conflict('That handover has already been reviewed.')
  }

  const remittance = await getRemittance(payment.remittance_id)
  const receipt = await nextHandoverReceipt(remittance.period)

  const { data, error } = await supabase
    .from('remittance_payments')
    .update({
      status: 'confirmed',
      receipt_no: receipt,
      reviewed_by: actorId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', paymentId)
    .eq('status', 'pending')
    .select('id, remittance_id, amount, receipt_no')
    .maybeSingle()

  if (error) throw toAppError(error)

  // Another reviewer won the race between the read above and this update.
  if (!data) throw conflict('That handover has already been reviewed.')

  await writeAuditLog({
    actorId,
    action: 'remittance.confirmed',
    entityType: 'remittance',
    entityId: data.remittance_id,
    after: { paymentId, amount: data.amount, receipt },
  })

  return receipt
}

export async function rejectRemittancePayment(
  actorId: string,
  paymentId: string,
  reason: string,
): Promise<void> {
  const supabase = createServerSupabase()

  if (!reason.trim()) {
    throw new AppError('bad_request', 'Say why it was rejected.')
  }

  const { data, error } = await supabase
    .from('remittance_payments')
    .update({
      status: 'rejected',
      rejection_reason: reason.trim(),
      reviewed_by: actorId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', paymentId)
    .eq('status', 'pending')
    .select('id, remittance_id')
    .maybeSingle()

  if (error) throw toAppError(error)
  if (!data) throw conflict('That payment has already been reviewed.')

  await writeAuditLog({
    actorId,
    action: 'remittance.rejected',
    entityType: 'remittance',
    entityId: data.remittance_id,
    after: { paymentId, reason: reason.trim() },
  })
}