import 'server-only'

import { createAdminSupabase } from '@/lib/supabase/admin'
import { writeAuditLog } from './audit.service'
import { sendSubscriptionInvoice } from './subscription-gateway.service'
import { PERIODS, limitsFor, planById, quote, type PlanId } from '@/lib/pricing'
import { todayInDhaka } from '@/lib/billing'
import { verifyInvoice, ziniConfig } from '@/lib/gateway/zinipay'
import { addMonths } from '@/lib/subscription'
import type { Json } from '@/types'

/**
 * Subscription payments made through ZiniPay.
 *
 * The trust model is the same as the SSLCommerz path, minus one leg. ZiniPay's
 * callback has no signature — anyone who learns an invoice id could post one —
 * so the callback is treated purely as a hint that something may have changed.
 * Every decision below comes from `verifyInvoice`, an authenticated call out to
 * ZiniPay, and from the row we wrote before the customer ever left the site.
 *
 * That means this function is safe to call from an unauthenticated webhook, from
 * the browser return, or twice from both: it is idempotent, and it never reads
 * an amount or a status from whoever called it.
 */

export type ZiniSubscriptionOutcome = {
  outcome: 'confirmed' | 'rejected' | 'duplicate' | 'invalid' | 'error'
  message: string
}

export async function handleZinipaySubscription(input: {
  /** Either identifier works; the row is found by whichever is given. */
  invoiceId?: string | null
  transactionId?: string | null
}): Promise<ZiniSubscriptionOutcome> {
  const admin = createAdminSupabase()

  const log = async (
    outcome: ZiniSubscriptionOutcome['outcome'] | 'received',
    options: {
      transactionId: string
      invoiceId?: string | null
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
      validation_id: options.invoiceId ?? null,
      event_type: 'subscription.payment',
      // No signature exists to check. Recording it as false keeps the column
      // honest rather than implying a check that never happened.
      signature_ok: false,
      gateway_status: options.status ?? null,
      amount: options.amount ?? null,
      payload: (options.payload ?? {}) as Json,
      payment_id: options.paymentId ?? null,
      outcome,
      error: options.error ?? null,
      received_at: new Date().toISOString(),
      processed_at: new Date().toISOString(),
    })
  }

  const invoiceId = input.invoiceId?.trim() || null
  const transactionId = input.transactionId?.trim() || null

  if (!invoiceId && !transactionId) {
    await log('invalid', { transactionId: '', error: 'No invoice or transaction id.' })
    return { outcome: 'invalid', message: 'No invoice or transaction id.' }
  }

  // 1. Our own row, found before anything is trusted.
  const query = admin.from('subscription_payments').select('*').eq('provider', 'zinipay')

  const { data: payment, error: lookupError } = invoiceId
    ? await query.eq('provider_reference', invoiceId).maybeSingle()
    : await query.eq('transaction_id', transactionId as string).maybeSingle()

  if (lookupError) {
    await log('error', {
      transactionId: transactionId ?? '',
      invoiceId,
      error: lookupError.message,
    })
    return { outcome: 'error', message: 'Could not look up the payment.' }
  }

  if (!payment) {
    await log('invalid', {
      transactionId: transactionId ?? '',
      invoiceId,
      error: 'Unknown subscription transaction.',
    })
    return { outcome: 'invalid', message: 'Unknown subscription transaction.' }
  }

  const tranId = payment.transaction_id as string
  const reference = (payment.provider_reference as string | null) ?? invoiceId

  if (!reference) {
    await log('invalid', {
      transactionId: tranId,
      paymentId: payment.id,
      error: 'No invoice reference stored for this payment.',
    })
    return { outcome: 'invalid', message: 'No invoice reference to check against.' }
  }

  if (payment.status === 'confirmed') {
    await log('duplicate', {
      transactionId: tranId,
      invoiceId: reference,
      paymentId: payment.id,
    })
    return { outcome: 'duplicate', message: 'Subscription payment already confirmed.' }
  }

  // 2. Ask ZiniPay what actually happened. This is the only source of truth.
  let verification
  try {
    verification = await verifyInvoice(reference, ziniConfig())
  } catch (error) {
    await log('error', {
      transactionId: tranId,
      invoiceId: reference,
      paymentId: payment.id,
      error: error instanceof Error ? error.message : 'verify call failed',
    })
    return { outcome: 'error', message: 'Could not verify with the provider.' }
  }

  if (verification.status !== 'COMPLETED') {
    // Pending is not a failure — the customer may still be paying. Only a
    // reported failure marks the row, so a retry can still succeed.
    if (verification.status === 'FAILED') {
      await admin
        .from('subscription_payments')
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
      invoiceId: reference,
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

  // 3. The amount must be the one we asked for.
  const expectedAmount = Number(payment.amount)

  if (Math.abs(verification.amount - expectedAmount) > 0.01) {
    await admin
      .from('subscription_payments')
      .update({
        status: 'failed',
        gateway_status: 'AMOUNT_MISMATCH',
        gateway_payload: verification.raw as Json,
      })
      .eq('id', payment.id)
      .eq('status', 'pending')

    await log('rejected', {
      transactionId: tranId,
      invoiceId: reference,
      paymentId: payment.id,
      amount: verification.amount,
      status: 'AMOUNT_MISMATCH',
      error: `Expected ${expectedAmount}, received ${verification.amount}.`,
      payload: verification.raw,
    })

    return { outcome: 'rejected', message: 'Payment amount did not match.' }
  }

  // 4. And it must be an amount our own price list would have produced.
  const planId = payment.plan as PlanId
  const plan = planById(planId)
  const period = PERIODS.find((item) => item.months === payment.months)

  if (!plan || plan.id === 'free' || !period) {
    await admin
      .from('subscription_payments')
      .update({ status: 'failed', gateway_status: 'INVALID_PLAN' })
      .eq('id', payment.id)
      .eq('status', 'pending')

    await log('rejected', {
      transactionId: tranId,
      invoiceId: reference,
      paymentId: payment.id,
      status: 'INVALID_PLAN',
      error: 'Invalid subscription plan or period.',
    })

    return { outcome: 'rejected', message: 'Invalid subscription plan or period.' }
  }

  const expectedQuote = quote(plan.id, payment.months)

  if (expectedQuote.total !== expectedAmount) {
    await admin
      .from('subscription_payments')
      .update({ status: 'failed', gateway_status: 'QUOTE_MISMATCH' })
      .eq('id', payment.id)
      .eq('status', 'pending')

    await log('rejected', {
      transactionId: tranId,
      invoiceId: reference,
      paymentId: payment.id,
      status: 'QUOTE_MISMATCH',
      error: 'Subscription amount does not match pricing.',
    })

    return { outcome: 'rejected', message: 'Subscription amount does not match pricing.' }
  }

  // 5. Confirm. The status guard is what makes a double callback harmless.
  // The plan starts today, not on the first of the month.
  const currentPeriodStart = todayInDhaka()
  const currentPeriodEnd = addMonths(currentPeriodStart, payment.months)
  const limits = limitsFor(plan.id)

  const { data: confirmed, error: confirmError } = await admin
    .from('subscription_payments')
    .update({
      status: 'confirmed',
      gateway_status: verification.status,
      gateway_payload: verification.raw as Json,
      paid_at: new Date().toISOString(),
    })
    .eq('id', payment.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()

  if (confirmError) {
    await log('error', {
      transactionId: tranId,
      invoiceId: reference,
      paymentId: payment.id,
      error: confirmError.message,
    })
    return { outcome: 'error', message: 'Could not confirm subscription payment.' }
  }

  if (!confirmed) {
    await log('duplicate', {
      transactionId: tranId,
      invoiceId: reference,
      paymentId: payment.id,
    })
    return { outcome: 'duplicate', message: 'Subscription payment already processed.' }
  }

  // 6. Activate. Update-or-insert rather than upsert, because the unique index
  //    on subscriptions is partial and cannot arbitrate an ON CONFLICT.
  const subscriptionRow = {
    org_id: payment.org_id,
    plan: plan.id,
    status: 'active' as const,
    unit_limit: limits.units,
    building_limit: limits.buildings,
    current_period_start: currentPeriodStart,
    current_period_end: currentPeriodEnd,
    provider: 'zinipay',
    provider_reference: verification.transactionId ?? reference,
    cancel_at_period_end: false,
    cancelled_at: null,
  }

  const { data: existing } = await admin
    .from('subscriptions')
    .select('id')
    .eq('org_id', payment.org_id)
    .neq('status', 'cancelled')
    .maybeSingle()

  const { error: subscriptionError } = existing
    ? await admin.from('subscriptions').update(subscriptionRow).eq('id', existing.id)
    : await admin.from('subscriptions').insert(subscriptionRow)

  if (subscriptionError) {
    await log('error', {
      transactionId: tranId,
      invoiceId: reference,
      paymentId: payment.id,
      error: subscriptionError.message,
    })
    return {
      outcome: 'error',
      message: 'Payment confirmed but subscription activation failed.',
    }
  }

  await sendSubscriptionInvoice({
    orgId: payment.org_id,
    transactionId: tranId,
    planName: plan.name,
    months: payment.months,
    amount: expectedAmount,
    listPrice: expectedQuote.listPrice,
    discountPercent: expectedQuote.discount,
    periodStart: currentPeriodStart,
    periodEnd: currentPeriodEnd,
    gatewayReference: verification.transactionId,
    method: verification.paymentMethod
      ? `${verification.paymentMethod} via ZiniPay`
      : 'Online (ZiniPay)',
  })

  await writeAuditLog({
    orgId: payment.org_id,
    actorId: null,
    action: 'subscription.payment_confirmed',
    entityType: 'subscription_payment',
    entityId: payment.id,
    after: {
      provider: 'zinipay',
      plan: plan.id,
      months: payment.months,
      amount: expectedAmount,
      transactionId: tranId,
      invoiceId: reference,
      method: verification.paymentMethod,
    },
  })

  await log('confirmed', {
    transactionId: tranId,
    invoiceId: reference,
    paymentId: payment.id,
    amount: verification.amount,
    status: verification.status,
    payload: verification.raw,
  })

  return { outcome: 'confirmed', message: 'Subscription activated successfully.' }
}
