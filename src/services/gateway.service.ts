import 'server-only'

import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { publicEnv } from '@/lib/env'
import { AppError, conflict, forbidden, notFound, toAppError } from '@/lib/errors'
import { writeAuditLog } from './audit.service'
import { getDue } from './dues.service'
import { outstandingOf, periodOf, receiptNumber } from '@/lib/billing'
import {
  newTransactionId,
  verifyIpnSignature,
  type IpnPayload,
} from '@/lib/gateway/signature'
import type { Json } from '@/types'
import { sslConfig, startSession, validateTransaction } from '@/lib/gateway/sslcommerz'

/**
 * Online payments.
 *
 * The trust model, in order:
 *
 *   1. We create the payment row ourselves, as `pending`, with the amount we
 *      expect. The browser never tells us what the rent is.
 *   2. The gateway's callback is checked for a valid signature.
 *   3. We call the gateway back and ask what happened. Only that answer
 *      confirms anything.
 *   4. The amount it reports must match the amount we recorded in step 1.
 *
 * A callback that fails any of these is logged and ignored. Confirmation runs
 * through the service role because no human is present — which is exactly why
 * every step above has to hold.
 */

export type CheckoutResult = { redirectUrl: string; transactionId: string }

export async function startCheckout(
  userId: string,
  input: { flatId: string; dueId: string },
): Promise<CheckoutResult> {
  const supabase = createServerSupabase()
  const env = publicEnv()

  const due = await getDue(input.dueId)
  if (due.flat_id !== input.flatId) {
    throw new AppError('bad_request', 'That charge belongs to a different flat.')
  }
  if (due.user_id !== userId) {
    throw forbidden('That charge is not yours to pay.')
  }
  if (due.status === 'waived') throw conflict('That charge has been waived.')

  const amount = outstandingOf({
    amount: Number(due.amount),
    amountPaid: Number(due.amount_paid),
    dueDate: due.due_date,
    status: due.status,
  })

  if (amount <= 0) throw conflict('That charge is already settled.')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email, phone')
    .eq('id', userId)
    .maybeSingle()

  const transactionId = newTransactionId(input.flatId)

  // The row exists before the resident reaches the gateway, so a callback
  // always has something to match against, and the amount is ours, not theirs.
  const { data: payment, error } = await supabase
    .from('payments')
    .insert({
      flat_id: input.flatId,
      due_id: input.dueId,
      paid_by: userId,
      amount,
      method: 'card',
      status: 'pending',
      paid_at: new Date().toISOString().slice(0, 10),
      gateway: 'sslcommerz',
      transaction_id: transactionId,
      gateway_status: 'initiated',
      note: 'Online payment',
    })
    .select('id')
    .single()

  if (error) throw toAppError(error)

  const base = env.NEXT_PUBLIC_SITE_URL
  const session = await startSession({
    transactionId,
    amount,
    customerName: profile?.full_name ?? 'Resident',
    customerEmail: profile?.email ?? 'resident@example.com',
    customerPhone: profile?.phone ?? '01700000000',
    productName: due.description ?? 'Rent',
    successUrl: `${base}/payments/return?status=success&tran=${transactionId}`,
    failUrl: `${base}/payments/return?status=failed&tran=${transactionId}`,
    cancelUrl: `${base}/payments/return?status=cancelled&tran=${transactionId}`,
    ipnUrl: `${base}/api/payments/webhook/sslcommerz`,
  })

  await writeAuditLog({
    actorId: userId,
    action: 'payment.checkout_started',
    entityType: 'payment',
    entityId: payment.id,
    after: { amount, transactionId },
  })

  return { redirectUrl: session.redirectUrl, transactionId }
}

export type IpnOutcome = {
  outcome: 'confirmed' | 'rejected' | 'duplicate' | 'invalid' | 'error'
  message: string
}

/**
 * Handles one callback from SSLCommerz.
 *
 * Runs with the service role: there is no signed-in user on a webhook. Every
 * decision, including the refusals, is written to `webhook_events`.
 */
export async function handleSslIpn(payload: IpnPayload): Promise<IpnOutcome> {
  const admin = createAdminSupabase()
  const transactionId = payload.tran_id ?? ''
  const validationId = payload.val_id ?? null

  const log = async (
    outcome: IpnOutcome['outcome'] | 'received',
    extra: {
      signatureOk: boolean
      paymentId?: string | null
      error?: string
      amount?: number | null
      status?: string | null
    },
  ) => {
    await admin.from('webhook_events').insert({
      provider: 'sslcommerz',
      transaction_id: transactionId || 'unknown',
      validation_id: validationId,
      signature_ok: extra.signatureOk,
      gateway_status: extra.status ?? payload.status ?? null,
      amount: extra.amount ?? null,
      payload: payload as unknown as Json,
      payment_id: extra.paymentId ?? null,
      outcome,
      error: extra.error ?? null,
      processed_at: new Date().toISOString(),
    })
  }

  // 1. Authenticity.
  const config = sslConfig()
  const signatureOk = verifyIpnSignature(payload, config.storePassword)

  if (!signatureOk) {
    await log('invalid', { signatureOk: false, error: 'Signature did not verify' })
    return { outcome: 'invalid', message: 'Signature did not verify.' }
  }

  if (!transactionId) {
    await log('invalid', { signatureOk: true, error: 'No transaction id' })
    return { outcome: 'invalid', message: 'No transaction id.' }
  }

  // 2. The payment we created before sending them to the gateway.
  const { data: payment } = await admin
    .from('payments')
    .select('*')
    .eq('transaction_id', transactionId)
    .maybeSingle()

  if (!payment) {
    await log('invalid', { signatureOk: true, error: 'Unknown transaction' })
    return { outcome: 'invalid', message: 'Unknown transaction.' }
  }

  // 3. Replays. A provider retrying a delivered event must change nothing.
  if (payment.status === 'confirmed') {
    await log('duplicate', { signatureOk: true, paymentId: payment.id })
    return { outcome: 'duplicate', message: 'Already confirmed.' }
  }

  if (!validationId) {
    await log('invalid', {
      signatureOk: true,
      paymentId: payment.id,
      error: 'No validation id',
    })
    return { outcome: 'invalid', message: 'No validation id to check against.' }
  }

  // 4. Ask the gateway what actually happened.
  let validation
  try {
    validation = await validateTransaction(validationId, config)
  } catch (error) {
    await log('error', {
      signatureOk: true,
      paymentId: payment.id,
      error: error instanceof Error ? error.message : 'validation call failed',
    })
    return { outcome: 'error', message: 'Could not validate with the gateway.' }
  }

  if (!validation.valid) {
    await admin
      .from('payments')
      .update({
        status: 'failed',
        gateway_status: validation.status,
        gateway_payload: validation.raw as Json,
      })
      .eq('id', payment.id)
      .eq('status', 'pending')

    await log('rejected', {
      signatureOk: true,
      paymentId: payment.id,
      status: validation.status,
      amount: validation.amount,
    })
    return { outcome: 'rejected', message: `Gateway reported ${validation.status}.` }
  }

  // 5. The amount must be the one we asked for. A signature says the message
  //    is authentic; it does not say the figure is right.
  const expected = Number(payment.amount)
  if (Math.abs(validation.amount - expected) > 0.01) {
    await admin
      .from('payments')
      .update({
        status: 'failed',
        gateway_status: 'AMOUNT_MISMATCH',
        gateway_payload: validation.raw as Json,
      })
      .eq('id', payment.id)

    await log('rejected', {
      signatureOk: true,
      paymentId: payment.id,
      amount: validation.amount,
      error: `Expected ${expected}, gateway reported ${validation.amount}`,
    })
    return { outcome: 'rejected', message: 'Amount did not match.' }
  }

  // 6. Confirm. The trigger on `payments` moves the due's balance.
  const receipt = await nextGatewayReceipt(periodOf(payment.paid_at))

  const { data: confirmed, error } = await admin
    .from('payments')
    .update({
      status: 'confirmed',
      method: mapMethod(validation.cardType),
      reviewed_at: new Date().toISOString(),
      receipt_no: receipt,
      gateway_status: validation.status,
      bank_transaction_id: validation.bankTransactionId,
      gateway_payload: validation.raw as Json,
    })
    .eq('id', payment.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()

  if (error) {
    await log('error', { signatureOk: true, paymentId: payment.id, error: error.message })
    return { outcome: 'error', message: 'Could not record the confirmation.' }
  }

  if (!confirmed) {
    // Another delivery of the same event won the race a moment ago.
    await log('duplicate', { signatureOk: true, paymentId: payment.id })
    return { outcome: 'duplicate', message: 'Already confirmed.' }
  }

  await log('confirmed', {
    signatureOk: true,
    paymentId: payment.id,
    amount: validation.amount,
    status: validation.status,
  })

  await writeAuditLog({
    actorId: null,
    action: 'payment.confirmed_by_gateway',
    entityType: 'payment',
    entityId: payment.id,
    after: {
      amount: validation.amount,
      receipt,
      transactionId,
      bankTransactionId: validation.bankTransactionId,
    },
  })

  return { outcome: 'confirmed', message: 'Payment confirmed.' }
}

/** bKash and Nagad arrive as card types; anything else is recorded as card. */
function mapMethod(cardType: string | null): 'bkash' | 'nagad' | 'card' {
  const value = (cardType ?? '').toLowerCase()
  if (value.includes('bkash')) return 'bkash'
  if (value.includes('nagad')) return 'nagad'
  return 'card'
}

/** Same monthly sequence as manual confirmations, issued with the service role. */
async function nextGatewayReceipt(period: string): Promise<string> {
  const admin = createAdminSupabase()
  const prefix = receiptNumber(period, 1).slice(0, 8)

  const { count } = await admin
    .from('payments')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'confirmed')
    .like('receipt_no', `${prefix}%`)

  return receiptNumber(period, (count ?? 0) + 1)
}

/** What the return page shows, looked up by our own transaction id. */
export async function getCheckoutStatus(userId: string, transactionId: string) {
  const supabase = createServerSupabase()

  const { data } = await supabase
    .from('payments')
    .select('id, amount, status, receipt_no, gateway_status, flat_id, paid_by')
    .eq('transaction_id', transactionId)
    .maybeSingle()

  if (!data) throw notFound('That payment')
  if (data.paid_by !== userId) throw forbidden('That payment is not yours.')

  return data
}
