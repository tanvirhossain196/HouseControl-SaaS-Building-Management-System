import 'server-only'

import { createServerSupabase } from '@/lib/supabase/server'
import { AppError, conflict, forbidden, notFound, toAppError } from '@/lib/errors'
import { writeAuditLog } from './audit.service'
import { notify, notifyMany } from './notifications.service'
import { getDue } from './dues.service'
import { outstandingOf, periodOf, receiptNumber } from '@/lib/billing'
import type { PaymentRow } from '@/types'

/**
 * Payments.
 *
 * A payment is a claim until someone with authority confirms it. Confirming is
 * the only thing that moves a balance, and it does so through the database
 * trigger on `payments` — this file never writes `dues.amount_paid`.
 *
 * Rejecting requires a reason, because "your payment was rejected" with no
 * explanation is how a resident ends up at the owner's door.
 */

export type PaymentWithContext = PaymentRow & {
  payerName: string | null
  unitNumber: string | null
  buildingId: string | null
  buildingName: string | null
  dueDescription: string | null
  /** rent, utility, penalty… — what the money is for. */
  category: string | null
  /** The month the charge belongs to, as YYYY-MM-01. */
  period: string | null
}

async function decorate(rows: unknown[]): Promise<PaymentWithContext[]> {
  const payments = rows as (PaymentRow & {
    payer: { full_name: string } | null
    flats: {
      unit_number: string
      building_id: string
      buildings: { name: string } | null
    } | null
    dues: {
      description: string | null
      source: string | null
      period: string | null
    } | null
  })[]

  return payments.map((payment) => ({
    ...payment,
    payerName: payment.payer?.full_name ?? null,
    unitNumber: payment.flats?.unit_number ?? null,
    // Filters match on ids, not names: two buildings may share a name.
    buildingId: payment.flats?.building_id ?? null,
    buildingName: payment.flats?.buildings?.name ?? null,
    dueDescription: payment.dues?.description ?? null,
    category: payment.dues?.source ?? null,
    period: payment.dues?.period ?? null,
  }))
}

/**
 * The payer, named explicitly.
 *
 * `payments` points at `profiles` twice — paid_by and reviewed_by — so a bare
 * `profiles(full_name)` is ambiguous and PostgREST refuses the whole query
 * rather than guessing. Every caller then caught the error and returned an
 * empty list, which is why the review queue sat at zero with five pending
 * payments in the table.
 *
 * The hint is the foreign key column rather than the constraint name. The
 * constraint is auto-named by Postgres and would silently break the day someone
 * renamed it; the column is the thing the code already knows about.
 */
const WITH_CONTEXT =
  '*, payer:profiles!paid_by(full_name), flats(unit_number, building_id, buildings(name)), dues(description, source, period)'

/** Payments waiting on a decision, oldest first — the review queue. */
export async function listPendingPayments(
  flatIds: string[],
): Promise<PaymentWithContext[]> {
  if (flatIds.length === 0) return []

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('payments')
    .select(WITH_CONTEXT)
    .in('flat_id', flatIds)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (error) throw toAppError(error)
  return decorate(data ?? [])
}

export async function listPaymentsForFlats(
  flatIds: string[],
  limit = 100,
): Promise<PaymentWithContext[]> {
  if (flatIds.length === 0) return []

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('payments')
    .select(WITH_CONTEXT)
    .in('flat_id', flatIds)
    .order('paid_at', { ascending: false })
    .limit(limit)

  if (error) throw toAppError(error)
  return decorate(data ?? [])
}

export async function listPaymentsForUser(
  userId: string,
  limit = 60,
): Promise<PaymentWithContext[]> {
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('payments')
    .select(WITH_CONTEXT)
    .eq('paid_by', userId)
    .order('paid_at', { ascending: false })
    .limit(limit)

  if (error) throw toAppError(error)
  return decorate(data ?? [])
}

export async function getPayment(paymentId: string): Promise<PaymentRow> {
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('id', paymentId)
    .maybeSingle()

  if (error) throw toAppError(error)
  if (!data) throw notFound('That payment')
  return data
}

export type SubmitPaymentInput = {
  flatId: string
  dueId?: string
  amount: number
  method: PaymentRow['method']
  paidAt: string
  reference?: string
  proofUrl?: string
  note?: string
}

/**
 * A resident recording money they have sent.
 *
 * Always lands as `pending`. The RLS policy allows a resident to insert only
 * for their own flat and only with that status, so this cannot be turned into
 * self-confirmation by calling it differently.
 */
/**
 * Everyone who can act on a payment for this flat.
 *
 * The flat's moderators, plus the admins of the organization that owns it. The
 * same answer RLS gives, asked from the other direction: not "may this person
 * see it" but "who needs telling".
 */
async function tellReviewers(
  flatId: string,
  input: {
    event: 'payment.submitted'
    subjectId: string
    link: string
    data: Record<string, string>
  },
): Promise<void> {
  try {
    const supabase = createServerSupabase()

    const { data: flat } = await supabase
      .from('flats')
      .select('unit_number, building_id, buildings(org_id)')
      .eq('id', flatId)
      .maybeSingle()

    const context = flat as unknown as {
      unit_number: string
      buildings: { org_id: string } | null
    } | null

    const orgId = context?.buildings?.org_id

    const [{ data: moderators }, { data: admins }] = await Promise.all([
      supabase
        .from('flat_members')
        .select('user_id')
        .eq('flat_id', flatId)
        .eq('role', 'moderator')
        .eq('status', 'active'),
      orgId
        ? supabase
            .from('org_members')
            .select('user_id')
            .eq('org_id', orgId)
            .eq('role', 'admin')
            .eq('status', 'active')
        : Promise.resolve({ data: [] as Array<{ user_id: string }> }),
    ])

    const userIds = [
      ...new Set([
        ...(moderators ?? []).map((row) => row.user_id),
        ...(admins ?? []).map((row) => row.user_id),
      ]),
    ]

    if (userIds.length === 0) return

    await notifyMany(userIds, {
      ...input,
      // The flat is read here anyway, so the message can name it without the
      // caller running a second query for the same row.
      data: { ...input.data, unit: context?.unit_number ?? '' },
      dedupeOn: 'subject',
    })
  } catch (cause) {
    // Never block the write. The payment is recorded either way.
    console.error('[notify] payment.submitted', flatId, cause)
  }
}

export async function submitPayment(
  userId: string,
  input: SubmitPaymentInput,
): Promise<PaymentRow> {
  const supabase = createServerSupabase()

  if (input.amount <= 0) throw new AppError('bad_request', 'Enter an amount above zero.')

  if (input.dueId) {
    const due = await getDue(input.dueId)

    if (due.flat_id !== input.flatId) {
      throw new AppError('bad_request', 'That charge belongs to a different flat.')
    }
    if (due.status === 'waived')
      throw conflict('That charge has been waived — nothing to pay.')

    const owed = outstandingOf({
      amount: Number(due.amount),
      amountPaid: Number(due.amount_paid),
      dueDate: due.due_date,
      status: due.status,
    })

    if (owed <= 0) throw conflict('That charge is already settled.')

    // Overpaying a single charge is refused rather than silently absorbed:
    // the extra belongs on another charge, and a receipt has to be honest.
    if (input.amount > owed + 0.01) {
      throw new AppError(
        'validation_failed',
        `That charge has ৳${owed.toLocaleString('en-BD')} outstanding. Pay it against another charge, or lower the amount.`,
      )
    }
  }

  const { data, error } = await supabase
    .from('payments')
    .insert({
      flat_id: input.flatId,
      due_id: input.dueId ?? null,
      paid_by: userId,
      amount: input.amount,
      method: input.method,
      status: 'pending',
      paid_at: input.paidAt,
      reference: input.reference ?? null,
      proof_url: input.proofUrl ?? null,
      note: input.note ?? null,
    })
    .select('*')
    .single()

  if (error) throw toAppError(error)

  await writeAuditLog({
    actorId: userId,
    action: 'payment.submitted',
    entityType: 'payment',
    entityId: data.id,
    after: { amount: data.amount, method: data.method, dueId: data.due_id },
  })

  /**
   * Tell whoever has to act on it.
   *
   * The queue is the record; the notification is the nudge. A moderator who
   * only finds out by opening the payments page is a moderator whose residents
   * wait days for a receipt — and notifications never gate the write, so a
   * failure here leaves the payment recorded and the ledger correct.
   */
  await tellReviewers(data.flat_id, {
    event: 'payment.submitted',
    subjectId: data.id,
    link: '/remittances',
    data: {
      amount: String(data.amount),
    },
  })

  return data
}

/**
 * Next receipt number for the month, e.g. HC-2609-0004.
 *
 * The sequence is per month, and `payments.receipt_no` is unique, so a race
 * between two moderators confirming at once fails on the constraint rather
 * than issuing the same number twice. The caller retries.
 */
async function nextReceiptNumber(period: string): Promise<string> {
  const supabase = createServerSupabase()
  const prefix = receiptNumber(period, 1).slice(0, 8) // "HC-2609-"

  const { count } = await supabase
    .from('payments')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'confirmed')
    .like('receipt_no', `${prefix}%`)

  return receiptNumber(period, (count ?? 0) + 1)
}

/**
 * Confirms a payment. This is the only action that moves a balance — the
 * trigger on `payments` recalculates the due's `amount_paid` and status.
 */
export async function confirmPayment(
  actorId: string,
  paymentId: string,
): Promise<PaymentRow> {
  const supabase = createServerSupabase()
  const payment = await getPayment(paymentId)

  if (payment.status === 'confirmed') throw conflict('This payment is already confirmed.')
  if (payment.status === 'rejected') {
    throw conflict('This payment was rejected. Ask the resident to submit it again.')
  }
  if (payment.paid_by === actorId) {
    // A moderator pays rent too. Someone else has to confirm their own money.
    throw forbidden('You cannot confirm your own payment. Ask the owner to review it.')
  }

  const period = periodOf(payment.paid_at)
  let lastError: unknown = null

  // Retry on the unique receipt-number constraint rather than locking.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const receipt = await nextReceiptNumber(period)

    const { data, error } = await supabase
      .from('payments')
      .update({
        status: 'confirmed',
        reviewed_by: actorId,
        reviewed_at: new Date().toISOString(),
        receipt_no: receipt,
        rejection_reason: null,
      })
      .eq('id', paymentId)
      .eq('status', 'pending')
      .select('*')
      .maybeSingle()

    if (!error && data) {
      await writeAuditLog({
        actorId,
        action: 'payment.confirmed',
        entityType: 'payment',
        entityId: paymentId,
        before: { status: payment.status },
        after: { amount: data.amount, receipt: data.receipt_no, dueId: data.due_id },
      })

      if (data.paid_by) {
        await notify({
          userId: data.paid_by,
          event: 'payment.confirmed',
          subjectId: paymentId,
          link: '/remittances',
          dedupeOn: 'subject',
          data: {
            amount: String(data.amount),
            receipt: data.receipt_no ?? '',
          },
        }).catch(() => undefined)
      }

      return data
    }

    if (!error && !data) {
      throw conflict('Someone else reviewed this payment a moment ago.')
    }

    lastError = error
    const code = (error as { code?: string } | null)?.code
    if (code !== '23505') break
  }

  throw toAppError(lastError)
}

/** Rejects a payment. The reason goes to the resident, so it has to be usable. */
export async function rejectPayment(
  actorId: string,
  paymentId: string,
  reason: string,
): Promise<PaymentRow> {
  const supabase = createServerSupabase()
  const payment = await getPayment(paymentId)

  if (payment.status === 'confirmed') {
    throw conflict('This payment is already confirmed. Reverse it instead.')
  }
  if (payment.status === 'rejected') throw conflict('This payment is already rejected.')

  const { data, error } = await supabase
    .from('payments')
    .update({
      status: 'rejected',
      reviewed_by: actorId,
      reviewed_at: new Date().toISOString(),
      rejection_reason: reason,
    })
    .eq('id', paymentId)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle()

  if (error) throw toAppError(error)
  if (!data) throw conflict('Someone else reviewed this payment a moment ago.')

  if (payment.paid_by) {
    await notify({
      userId: payment.paid_by,
      event: 'payment.rejected',
      subjectId: paymentId,
      link: '/remittances',
      dedupeOn: 'subject',
      data: { amount: String(payment.amount), reason },
    }).catch(() => undefined)
  }

  await writeAuditLog({
    actorId,
    action: 'payment.rejected',
    entityType: 'payment',
    entityId: paymentId,
    after: { reason },
  })

  return data
}

/**
 * Undoes a confirmation — a bank transfer that bounced, a receipt entered
 * against the wrong flat.
 *
 * The row keeps its receipt number so the paper trail still resolves, and the
 * trigger puts the due back where it was.
 */
export async function reversePayment(
  actorId: string,
  paymentId: string,
  reason: string,
): Promise<void> {
  const supabase = createServerSupabase()
  const payment = await getPayment(paymentId)

  if (payment.status !== 'confirmed')
    throw conflict('Only a confirmed payment can be reversed.')

  const { error } = await supabase
    .from('payments')
    .update({
      status: 'rejected',
      reviewed_by: actorId,
      reviewed_at: new Date().toISOString(),
      rejection_reason: `Reversed: ${reason}`,
    })
    .eq('id', paymentId)

  if (error) throw toAppError(error)

  await writeAuditLog({
    actorId,
    action: 'payment.reversed',
    entityType: 'payment',
    entityId: paymentId,
    before: { amount: payment.amount, receipt: payment.receipt_no },
    after: { reason },
  })
}
