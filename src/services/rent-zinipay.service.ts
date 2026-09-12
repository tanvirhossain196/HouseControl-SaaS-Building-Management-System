import 'server-only'

import { createAdminSupabase } from '@/lib/supabase/admin'
import { writeAuditLog } from './audit.service'
import { notify } from './notifications.service'
import { periodOf, receiptNumber } from '@/lib/billing'
import { verifyInvoice, ziniConfig } from '@/lib/gateway/zinipay'
import type { Json } from '@/types'

/**
 * Rent paid through ZiniPay.
 *
 * The same trust model as the SSLCommerz path, minus one leg. ZiniPay's
 * callback carries no signature — anyone who learned an invoice id could post
 * one — so the callback is only ever a hint that something may have changed.
 * Every decision below comes from `verifyInvoice`, an authenticated call out to
 * ZiniPay, and from the row we wrote before the resident left the site.
 *
 * Safe to call from an unauthenticated webhook, from the browser return, or
 * twice from both: it is idempotent and never reads an amount or a status from
 * whoever called it.
 *
 * A confirmed payment here needs no moderator review. The money did not pass
 * through them — they cannot confirm receiving what went straight to the
 * gateway — so the receipt is issued immediately, exactly as the SSLCommerz
 * path does.
 */

export type RentIpnOutcome = {
  outcome: 'confirmed' | 'rejected' | 'duplicate' | 'invalid' | 'error'
  message: string
}

async function nextReceipt(period: string): Promise<string> {
  const admin = createAdminSupabase()
  const prefix = receiptNumber(period, 1).slice(0, 8)

  const { count } = await admin
    .from('payments')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'confirmed')
    .like('receipt_no', `${prefix}%`)

  return receiptNumber(period, (count ?? 0) + 1)
}

/** bKash and Nagad arrive as a method name; anything else is recorded as card. */
function mapMethod(value: string | null): 'bkash' | 'nagad' | 'card' {
  const name = (value ?? '').toLowerCase()
  if (name.includes('bkash')) return 'bkash'
  if (name.includes('nagad')) return 'nagad'
  return 'card'
}

export async function handleZinipayRent(input: {
  /** Either identifier works; the row is found by whichever is given. */
  invoiceId?: string | null
  transactionId?: string | null
}): Promise<RentIpnOutcome> {
  const admin = createAdminSupabase()

  const invoiceId = input.invoiceId?.trim() || null
  const transactionId = input.transactionId?.trim() || null

  const log = async (
    outcome: RentIpnOutcome['outcome'] | 'received',
    options: {
      transactionId: string
      paymentId?: string | null
      amount?: number | null
      status?: string | null
      error?: string
      payload?: unknown
    },
  ) => {
    await admin.from('webhook_events').insert({
      provider: 'zinipay',
      transaction_id: options.transactionId || 'unknown',
      validation_id: invoiceId,
      event_type: 'rent.payment',
      // Nothing was signed, so nothing was checked. Recording it as false keeps
      // the column honest rather than implying a verification that never ran.
      signature_ok: false,
      gateway_status: options.status ?? null,
      amount: options.amount ?? null,
      payload: (options.payload ?? {}) as Json,
      payment_id: options.paymentId ?? null,
      outcome,
      error: options.error ?? null,
      processed_at: new Date().toISOString(),
    })
  }

  if (!invoiceId && !transactionId) {
    await log('invalid', { transactionId: '', error: 'No invoice or transaction id.' })
    return { outcome: 'invalid', message: 'No invoice or transaction id.' }
  }

  // 1. Our own row, found before anything is trusted.
  const query = admin.from('payments').select('*').eq('gateway', 'zinipay')

  const { data: payment, error: lookupError } = invoiceId
    ? await query.eq('bank_transaction_id', invoiceId).maybeSingle()
    : await query.eq('transaction_id', transactionId as string).maybeSingle()

  if (lookupError) {
    await log('error', { transactionId: transactionId ?? '', error: lookupError.message })
    return { outcome: 'error', message: 'Could not look up the payment.' }
  }

  if (!payment) {
    await log('invalid', {
      transactionId: transactionId ?? '',
      error: 'Unknown transaction.',
    })
    return { outcome: 'invalid', message: 'Unknown transaction.' }
  }

  const tranId = payment.transaction_id as string
  const reference = (payment.bank_transaction_id as string | null) ?? invoiceId

  if (!reference) {
    await log('invalid', {
      transactionId: tranId,
      paymentId: payment.id,
      error: 'No invoice reference stored.',
    })
    return { outcome: 'invalid', message: 'No invoice reference to check against.' }
  }

  if (payment.status === 'confirmed') {
    await log('duplicate', { transactionId: tranId, paymentId: payment.id })
    return { outcome: 'duplicate', message: 'Already confirmed.' }
  }

  // 2. Ask ZiniPay what actually happened.
  let verification
  try {
    verification = await verifyInvoice(reference, ziniConfig())
  } catch (cause) {
    await log('error', {
      transactionId: tranId,
      paymentId: payment.id,
      error: cause instanceof Error ? cause.message : 'verify call failed',
    })
    return { outcome: 'error', message: 'Could not verify with the provider.' }
  }

  if (verification.status !== 'COMPLETED') {
    // Pending is not a failure — the resident may still be paying. Only a
    // reported failure marks the row, so a retry can still succeed.
    if (verification.status === 'FAILED') {
      await admin
        .from('payments')
        .update({
          status: 'failed',
          gateway_status: verification.status,
          gateway_payload: verification.raw as Json,
        })
        .eq('id', payment.id)
        .eq('status', 'pending')
    }

    await log(verification.status === 'FAILED' ? 'rejected' : 'received', {
      transactionId: tranId,
      paymentId: payment.id,
      amount: verification.amount,
      status: verification.status,
      payload: verification.raw,
    })

    return {
      outcome: verification.status === 'FAILED' ? 'rejected' : 'error',
      message: `Provider reported ${verification.status}.`,
    }
  }

  // 3. The amount must be the one we asked for. A gateway saying money arrived
  //    does not say how much we were owed — that figure is ours.
  const expected = Number(payment.amount)

  if (Math.abs(verification.amount - expected) > 0.01) {
    await admin
      .from('payments')
      .update({
        status: 'failed',
        gateway_status: 'AMOUNT_MISMATCH',
        gateway_payload: verification.raw as Json,
      })
      .eq('id', payment.id)
      .eq('status', 'pending')

    await log('rejected', {
      transactionId: tranId,
      paymentId: payment.id,
      amount: verification.amount,
      status: 'AMOUNT_MISMATCH',
      error: `Expected ${expected}, received ${verification.amount}`,
      payload: verification.raw,
    })

    return { outcome: 'rejected', message: 'Amount did not match.' }
  }

  // 4. Confirm. The status guard is what makes a double callback harmless, and
  //    the trigger on `payments` moves the due's balance.
  const receipt = await nextReceipt(periodOf(payment.paid_at))

  const { data: confirmed, error } = await admin
    .from('payments')
    .update({
      status: 'confirmed',
      method: mapMethod(verification.paymentMethod),
      reviewed_at: new Date().toISOString(),
      receipt_no: receipt,
      gateway_status: verification.status,
      bank_transaction_id: verification.transactionId ?? reference,
      gateway_payload: verification.raw as Json,
    })
    .eq('id', payment.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()

  if (error) {
    await log('error', {
      transactionId: tranId,
      paymentId: payment.id,
      error: error.message,
    })
    return { outcome: 'error', message: 'Could not record the confirmation.' }
  }

  if (!confirmed) {
    // Another delivery of the same event won the race a moment ago.
    await log('duplicate', { transactionId: tranId, paymentId: payment.id })
    return { outcome: 'duplicate', message: 'Already confirmed.' }
  }

  if (payment.paid_by) {
    await notify({
      userId: payment.paid_by,
      event: 'payment.confirmed',
      subjectId: payment.id,
      link: '/remittances',
      dedupeOn: 'subject',
      data: { amount: String(expected), receipt },
    }).catch(() => undefined)
  }

  await writeAuditLog({
    actorId: null,
    action: 'payment.confirmed_by_gateway',
    entityType: 'payment',
    entityId: payment.id,
    after: {
      provider: 'zinipay',
      amount: verification.amount,
      receipt,
      transactionId: tranId,
      method: verification.paymentMethod,
    },
  })

  await log('confirmed', {
    transactionId: tranId,
    paymentId: payment.id,
    amount: verification.amount,
    status: verification.status,
    payload: verification.raw,
  })

  return { outcome: 'confirmed', message: 'Payment confirmed.' }
}
