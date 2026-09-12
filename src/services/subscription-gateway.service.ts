import 'server-only'

import { conflict, forbidden, notFound, toAppError } from '@/lib/errors'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { publicEnv } from '@/lib/env'
import { writeAuditLog } from './audit.service'
import { PERIODS, limitsFor, planById, quote, type PlanId } from '@/lib/pricing'
import { todayInDhaka } from '@/lib/billing'
import { sslConfig, validateTransaction } from '@/lib/gateway/sslcommerz'
import { verifyIpnSignature, type IpnPayload } from '@/lib/gateway/signature'
import type { Json } from '@/types'
import { sendEmail, renderEmail } from '@/lib/messaging/email'
import { buildInvoicePdf, invoiceNumberFor, money } from '@/lib/invoice'
import { addMonths, formatDay } from '@/lib/subscription'
import { site } from '@/lib/site'

export type SubscriptionIpnOutcome = {
  outcome: 'confirmed' | 'rejected' | 'duplicate' | 'invalid' | 'error'
  message: string
}

/**
 * Sends the confirmation and its invoice to the organization's admins.
 *
 * Runs after the plan is already active, and every failure is swallowed. A
 * mail server being down is not a reason to leave someone's paid plan
 * unactivated, and the IPN must still answer 200 or the gateway will retry a
 * payment that has already been applied.
 */
export async function sendSubscriptionInvoice(input: {
  orgId: string
  transactionId: string
  planName: string
  months: number
  amount: number
  listPrice: number
  discountPercent: number
  periodStart: string
  periodEnd: string
  gatewayReference: string | null
  /** How it was paid, spelled out for the customer: "bKash via ZiniPay". */
  method: string
}): Promise<void> {
  try {
    const admin = createAdminSupabase()

    /**
     * Two queries rather than one embedded select.
     *
     * org_members has two foreign keys into profiles — `user_id` and
     * `invited_by` — so PostgREST cannot tell which one `profiles(...)` means
     * and refuses the embed outright. Naming the constraint would work until
     * someone renames it. Reading the ids and then the profiles cannot become
     * ambiguous at all.
     */
    const [{ data: organisation }, { data: members, error: membersError }] =
      await Promise.all([
        admin.from('organizations').select('name').eq('id', input.orgId).maybeSingle(),
        admin
          .from('org_members')
          .select('user_id')
          .eq('org_id', input.orgId)
          .eq('role', 'admin')
          .eq('status', 'active'),
      ])

    if (membersError) {
      console.error('[subscription-invoice] member lookup failed', membersError.message)
      return
    }

    const adminIds = (members ?? []).map((member) => member.user_id)

    if (adminIds.length === 0) {
      console.warn(
        '[subscription-invoice] no active admins for org',
        input.orgId,
        '— nothing sent',
      )
      return
    }

    const { data: profiles, error: profilesError } = await admin
      .from('profiles')
      .select('full_name, email')
      .in('id', adminIds)

    if (profilesError) {
      console.error('[subscription-invoice] profile lookup failed', profilesError.message)
      return
    }

    const recipients = (profiles ?? []).filter(
      (profile): profile is { full_name: string; email: string } =>
        Boolean(profile.email),
    )

    if (recipients.length === 0) {
      console.warn('[subscription-invoice] admins have no email address — nothing sent')
      return
    }

    const invoiceNo = invoiceNumberFor(input.transactionId)
    const orgName = organisation?.name ?? 'your organization'

    // One PDF, addressed to the first admin, sent to all of them. Rendering a
    // separate document per recipient would put different names on copies of
    // the same invoice.
    const pdf = await buildInvoicePdf({
      invoiceNo,
      transactionId: input.transactionId,
      issuedOn: new Date().toISOString().slice(0, 10),
      planName: input.planName,
      months: input.months,
      amount: input.amount,
      listPrice: input.listPrice,
      discountPercent: input.discountPercent,
      organisation: orgName,
      billedTo: recipients[0]?.full_name ?? 'Customer',
      email: recipients[0]?.email ?? '',
      method: input.method,
      gatewayReference: input.gatewayReference,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    })

    const { html, text } = renderEmail({
      title: `${input.planName} plan is active`,
      body: `Thank you. ${orgName} is now on the ${input.planName} plan, and the invoice is attached to this email as a PDF.`,
      details: [
        {
          label: 'Plan',
          value: `${input.planName} — ${input.months} month${input.months === 1 ? '' : 's'}`,
        },
        {
          label: 'Covers',
          value: `${formatDay(input.periodStart)} to ${formatDay(input.periodEnd)}`,
        },
        { label: 'Paid with', value: input.method },
        { label: 'Invoice', value: invoiceNo },
        { label: 'Amount paid', value: money(input.amount), strong: true },
      ],
      actionLabel: 'View plan and billing',
      actionUrl: '/settings/billing',
      footnote:
        'Subscriptions do not renew automatically. Nothing is charged again on the end date — buy again whenever you are ready.',
    })

    for (const recipient of recipients) {
      const result = await sendEmail({
        to: recipient.email,
        subject: `${site.name} — ${input.planName} plan activated (${invoiceNo})`,
        html,
        text,
        attachments: [
          {
            filename: `${invoiceNo}.pdf`,
            content: pdf,
            contentType: 'application/pdf',
          },
        ],
      })

      console.info(
        '[subscription-invoice]',
        invoiceNo,
        '->',
        recipient.email,
        result.status === 'sent'
          ? 'sent'
          : result.status === 'skipped'
            ? `skipped: ${result.reason}`
            : `failed: ${result.error}`,
      )
    }
  } catch (error) {
    console.error('[subscription-invoice] email failed', input.transactionId, error)
  }
}

export async function handleSubscriptionIpn(
  payload: IpnPayload,
): Promise<SubscriptionIpnOutcome> {
  const admin = createAdminSupabase()
  const transactionId = payload.tran_id ?? ''
  const validationId = payload.val_id ?? null

  const log = async (
    outcome: SubscriptionIpnOutcome['outcome'] | 'received',
    options: {
      signatureOk: boolean
      paymentId?: string | null
      amount?: number | null
      status?: string | null
      error?: string
    },
  ) => {
    await admin.from('webhook_events').insert({
      provider: 'sslcommerz',
      transaction_id: transactionId || 'unknown',
      validation_id: validationId,
      event_type: 'subscription.payment',
      signature_ok: options.signatureOk,
      gateway_status: options.status ?? payload.status ?? null,
      amount: options.amount ?? null,
      payload: payload as unknown as Json,
      payment_id: options.paymentId ?? null,
      outcome,
      error: options.error ?? null,
      received_at: new Date().toISOString(),
      processed_at: new Date().toISOString(),
    })
  }

  const config = sslConfig()
  const signatureOk = verifyIpnSignature(payload, config.storePassword)

  if (!signatureOk) {
    await log('invalid', {
      signatureOk: false,
      error: 'Signature did not verify.',
    })

    return {
      outcome: 'invalid',
      message: 'Signature did not verify.',
    }
  }

  if (!transactionId) {
    await log('invalid', {
      signatureOk: true,
      error: 'Missing transaction id.',
    })

    return {
      outcome: 'invalid',
      message: 'Missing transaction id.',
    }
  }

  const { data: payment, error: paymentError } = await admin
    .from('subscription_payments')
    .select('*')
    .eq('transaction_id', transactionId)
    .maybeSingle()

  if (paymentError) {
    await log('error', {
      signatureOk: true,
      error: paymentError.message,
    })

    return {
      outcome: 'error',
      message: 'Could not find subscription payment.',
    }
  }

  if (!payment) {
    await log('invalid', {
      signatureOk: true,
      error: 'Unknown subscription transaction.',
    })

    return {
      outcome: 'invalid',
      message: 'Unknown subscription transaction.',
    }
  }

  if (payment.status === 'confirmed') {
    await log('duplicate', {
      signatureOk: true,
      paymentId: payment.id,
    })

    return {
      outcome: 'duplicate',
      message: 'Subscription payment already confirmed.',
    }
  }

  if (!validationId) {
    await log('invalid', {
      signatureOk: true,
      paymentId: payment.id,
      error: 'Missing validation id.',
    })

    return {
      outcome: 'invalid',
      message: 'Missing validation id.',
    }
  }

  let validation

  try {
    validation = await validateTransaction(validationId, config)
  } catch (error) {
    const message = toAppError(error).message

    await log('error', {
      signatureOk: true,
      paymentId: payment.id,
      error: message,
    })

    return {
      outcome: 'error',
      message,
    }
  }

  if (validation.transactionId !== transactionId) {
    await admin
      .from('subscription_payments')
      .update({
        status: 'failed',
        gateway_status: 'TRANSACTION_MISMATCH',
        gateway_payload: validation.raw as Json,
      })
      .eq('id', payment.id)
      .eq('status', 'pending')

    await log('rejected', {
      signatureOk: true,
      paymentId: payment.id,
      status: 'TRANSACTION_MISMATCH',
      error: 'Gateway transaction id did not match.',
    })

    return {
      outcome: 'rejected',
      message: 'Gateway transaction did not match.',
    }
  }

  if (!validation.valid || validation.currency !== 'BDT') {
    await admin
      .from('subscription_payments')
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
      amount: validation.amount,
      status: validation.status,
      error: 'Gateway payment was not valid.',
    })

    return {
      outcome: 'rejected',
      message: `Gateway reported ${validation.status}.`,
    }
  }

  const expectedAmount = Number(payment.amount)

  if (Math.abs(validation.amount - expectedAmount) > 0.01) {
    await admin
      .from('subscription_payments')
      .update({
        status: 'failed',
        gateway_status: 'AMOUNT_MISMATCH',
        gateway_payload: validation.raw as Json,
      })
      .eq('id', payment.id)
      .eq('status', 'pending')

    await log('rejected', {
      signatureOk: true,
      paymentId: payment.id,
      amount: validation.amount,
      status: 'AMOUNT_MISMATCH',
      error: `Expected ${expectedAmount}, received ${validation.amount}.`,
    })

    return {
      outcome: 'rejected',
      message: 'Payment amount did not match.',
    }
  }

  const planId = payment.plan as PlanId
  const plan = planById(planId)
  const period = PERIODS.find((item) => item.months === payment.months)

  if (!plan || plan.id === 'free' || !period) {
    await admin
      .from('subscription_payments')
      .update({
        status: 'failed',
        gateway_status: 'INVALID_PLAN',
        gateway_payload: validation.raw as Json,
      })
      .eq('id', payment.id)
      .eq('status', 'pending')

    await log('rejected', {
      signatureOk: true,
      paymentId: payment.id,
      status: 'INVALID_PLAN',
      error: 'Invalid subscription plan or period.',
    })

    return {
      outcome: 'rejected',
      message: 'Invalid subscription plan or period.',
    }
  }

  const expectedQuote = quote(plan.id, payment.months)

  if (expectedQuote.total !== expectedAmount) {
    await admin
      .from('subscription_payments')
      .update({
        status: 'failed',
        gateway_status: 'QUOTE_MISMATCH',
        gateway_payload: validation.raw as Json,
      })
      .eq('id', payment.id)
      .eq('status', 'pending')

    await log('rejected', {
      signatureOk: true,
      paymentId: payment.id,
      status: 'QUOTE_MISMATCH',
      error: 'Subscription amount does not match pricing.',
    })

    return {
      outcome: 'rejected',
      message: 'Subscription amount does not match pricing.',
    }
  }

  // The plan starts today, not on the first of the month.
  const currentPeriodStart = todayInDhaka()
  const currentPeriodEnd = addMonths(currentPeriodStart, payment.months)

  const limits = limitsFor(plan.id)

  const { data: confirmedPayment, error: confirmError } = await admin
    .from('subscription_payments')
    .update({
      status: 'confirmed',
      provider_reference:
        validation.bankTransactionId ?? payment.provider_reference ?? null,
      gateway_status: validation.status,
      gateway_payload: validation.raw as Json,
      paid_at: new Date().toISOString(),
    })
    .eq('id', payment.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()

  if (confirmError) {
    await log('error', {
      signatureOk: true,
      paymentId: payment.id,
      error: confirmError.message,
    })

    return {
      outcome: 'error',
      message: 'Could not confirm subscription payment.',
    }
  }

  if (!confirmedPayment) {
    await log('duplicate', {
      signatureOk: true,
      paymentId: payment.id,
    })

    return {
      outcome: 'duplicate',
      message: 'Subscription payment already processed.',
    }
  }

  /**
   * Activation, without ON CONFLICT.
   *
   * `subscriptions_one_active_per_org` is a partial unique index — it only
   * covers rows where status <> 'cancelled'. Postgres will not accept a partial
   * index as a conflict arbiter unless the statement repeats the index
   * predicate, which an upsert through PostgREST cannot express, so `upsert`
   * here fails with 42P10 and the payment ends up confirmed while the plan
   * stays inactive. Looking the row up first sidesteps the whole problem: an
   * org has at most one non-cancelled subscription, which is exactly what the
   * index guarantees.
   */
  const subscriptionRow = {
    org_id: payment.org_id,
    plan: plan.id,
    status: 'active' as const,
    unit_limit: limits.units,
    building_limit: limits.buildings,
    current_period_start: currentPeriodStart,
    current_period_end: currentPeriodEnd,
    provider: 'sslcommerz',
    provider_reference:
      validation.bankTransactionId ?? payment.provider_reference ?? null,
    cancelled_at: null,
  }

  const { data: existing, error: lookupError } = await admin
    .from('subscriptions')
    .select('id')
    .eq('org_id', payment.org_id)
    .neq('status', 'cancelled')
    .maybeSingle()

  if (lookupError) {
    await log('error', {
      signatureOk: true,
      paymentId: payment.id,
      error: lookupError.message,
    })

    return {
      outcome: 'error',
      message: 'Payment confirmed but subscription lookup failed.',
    }
  }

  const { error: subscriptionError } = existing
    ? await admin.from('subscriptions').update(subscriptionRow).eq('id', existing.id)
    : await admin.from('subscriptions').insert(subscriptionRow)

  if (subscriptionError) {
    await log('error', {
      signatureOk: true,
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
    transactionId,
    planName: plan.name,
    months: payment.months,
    amount: expectedAmount,
    listPrice: expectedQuote.listPrice,
    discountPercent: expectedQuote.discount,
    periodStart: currentPeriodStart,
    periodEnd: currentPeriodEnd,
    gatewayReference: validation.bankTransactionId ?? null,
    method: validation.cardType
      ? `${validation.cardType} via SSLCommerz`
      : 'Online (SSLCommerz)',
  })

  await writeAuditLog({
    orgId: payment.org_id,
    actorId: null,
    action: 'subscription.payment_confirmed',
    entityType: 'subscription_payment',
    entityId: payment.id,
    after: {
      plan: plan.id,
      months: payment.months,
      amount: expectedAmount,
      transactionId,
      currentPeriodStart,
      currentPeriodEnd,
    },
  })

  await log('confirmed', {
    signatureOk: true,
    paymentId: payment.id,
    amount: validation.amount,
    status: validation.status,
  })

  return {
    outcome: 'confirmed',
    message: 'Subscription activated successfully.',
  }
}
