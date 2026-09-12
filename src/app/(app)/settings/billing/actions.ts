'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireSession } from '@/lib/auth/session'
import { defaultOrgId, sessionRole } from '@/lib/auth/guards'
import { publicEnv } from '@/lib/env'
import { toAppError } from '@/lib/errors'
import { createAdminSupabase } from '@/lib/supabase/admin'

import { PERIODS, limitsFor, planById, quote, type PlanId } from '@/lib/pricing'

import { newTransactionId } from '@/lib/gateway/signature'
import { startSession } from '@/lib/gateway/sslcommerz'
import { createInvoice, hasZinipay } from '@/lib/gateway/zinipay'
import { writeAuditLog } from '@/services/audit.service'

import type { ActionResult } from '@/types'

const checkoutSchema = z.object({
  planId: z.enum(['plus', 'pro']),
  months: z.coerce
    .number()
    .refine(
      (value) => PERIODS.some((period) => period.months === value),
      'Select a valid billing period.',
    ),
})

/**
 * Which provider takes subscription money.
 *
 * SSLCommerz needs a trade licence and a live merchant account; ZiniPay does
 * not, which is why it runs first while that approval is pending. Both paths
 * stay in the code and both webhooks stay mounted, so switching back is an
 * environment change rather than a deployment.
 *
 * Rent payments are deliberately not affected — those are the landlord's money,
 * not ours, and they keep going through the licensed gateway.
 */
function subscriptionProvider(): 'zinipay' | 'sslcommerz' {
  const configured = process.env.SUBSCRIPTION_GATEWAY?.trim().toLowerCase()

  if (configured === 'sslcommerz') return 'sslcommerz'
  if (configured === 'zinipay') return 'zinipay'

  return hasZinipay() ? 'zinipay' : 'sslcommerz'
}

function invalid(error: z.ZodError): Extract<ActionResult<never>, { ok: false }> {
  const fieldErrors: Record<string, string[]> = {}

  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form'
    ;(fieldErrors[key] ??= []).push(issue.message)
  }

  return {
    ok: false,
    error: 'Some fields need fixing.',
    fieldErrors,
  }
}

function refreshBilling() {
  revalidatePath('/settings/billing')
  revalidatePath('/dashboard')
  revalidatePath('/admin')
}

export async function startSubscriptionCheckout(input: unknown): Promise<
  ActionResult<{
    redirectUrl: string
    transactionId: string
  }>
> {
  const parsed = checkoutSchema.safeParse(input)

  if (!parsed.success) {
    return invalid(parsed.error)
  }

  try {
    const session = await requireSession('/settings/billing')

    const role = sessionRole(session)

    if (role !== 'admin' && role !== 'super_admin') {
      return {
        ok: false,
        error: 'Only the organization owner can manage billing.',
      }
    }

    const orgId = defaultOrgId(session)

    if (!orgId) {
      return {
        ok: false,
        error: 'Set up your organization before choosing a plan.',
      }
    }

    const planId = parsed.data.planId as PlanId
    const plan = planById(planId)

    if (!plan || plan.monthly <= 0) {
      return {
        ok: false,
        error: 'Select a paid plan to continue.',
      }
    }

    const pricing = quote(planId, parsed.data.months)

    if (pricing.total <= 0) {
      return {
        ok: false,
        error: 'The selected plan amount is invalid.',
      }
    }

    const period = PERIODS.find((candidate) => candidate.months === parsed.data.months)

    if (!period) {
      return {
        ok: false,
        error: 'The selected billing period is invalid.',
      }
    }

    const transactionId = newTransactionId(orgId)
    const admin = createAdminSupabase()
    const provider = subscriptionProvider()

    const { data: checkout, error: insertError } = await admin
      .from('subscription_payments')
      .insert({
        org_id: orgId,
        plan: planId,
        months: period.months,
        amount: pricing.total,
        currency: 'BDT',
        provider,
        transaction_id: transactionId,
        status: 'pending',
      })
      .select('id')
      .single()

    if (insertError || !checkout) {
      throw insertError ?? new Error('Could not create subscription payment.')
    }

    const env = publicEnv()
    const siteUrl = env.NEXT_PUBLIC_SITE_URL

    /**
     * The gateway sends the customer back with a cross-site form POST. Pointing
     * it straight at /settings/billing trips the CSRF check in middleware, and
     * the Lax session cookie would not be sent anyway. So it lands on a small
     * bridge route that answers 303, turning the follow-up into a same-site GET.
     */
    const returnTo = encodeURIComponent('/settings/billing')
    const handler = provider === 'zinipay' ? 'zinipay' : 'subscription'
      const returnUrl = (status: string) =>
    `${siteUrl}/api/gateway/return?to=${returnTo}&handler=${handler}&status=${status}&tran=${transactionId}`

    if (provider === 'zinipay') {
      try {
        const invoice = await createInvoice({
          amount: pricing.total,
          customerName: session.profile?.full_name ?? 'HouseControl customer',
          customerEmail: session.email ?? 'customer@example.com',
          redirectUrl: returnUrl('success'),
          cancelUrl: returnUrl('cancelled'),
          webhookUrl: `${siteUrl}/api/subscriptions/webhook/zinipay`,
          // Echoed back on verify; useful when reading a payment by hand.
          metadata: { transaction_id: transactionId, plan: planId },
        })

        // The invoice id is how the webhook finds this row later, so it has to
        // be stored before the customer can possibly finish paying.
        const { error: referenceError } = await admin
          .from('subscription_payments')
          .update({ provider_reference: invoice.invoiceId })
          .eq('id', checkout.id)
          .eq('status', 'pending')

        if (referenceError) throw referenceError

        refreshBilling()

        return {
          ok: true,
          data: { redirectUrl: invoice.paymentUrl, transactionId },
        }
      } catch (gatewayError) {
        await admin
          .from('subscription_payments')
          .update({
            status: 'failed',
            gateway_status: 'SESSION_START_FAILED',
            gateway_payload: {
              message:
                gatewayError instanceof Error
                  ? gatewayError.message
                  : 'Gateway session failed',
            },
          })
          .eq('id', checkout.id)
          .eq('status', 'pending')

        throw gatewayError
      }
    }

    try {
      const gateway = await startSession({
        transactionId,
        amount: pricing.total,
        customerName: session.profile?.full_name ?? 'HouseControl customer',
        customerEmail: session.email ?? 'customer@example.com',
        customerPhone: session.profile?.phone ?? '01700000000',
        productName: `HouseControl ${plan.name} plan`,
        productCategory: 'Subscription',
        successUrl: returnUrl('success'),
        failUrl: returnUrl('failed'),
        cancelUrl: returnUrl('cancelled'),
        ipnUrl: `${siteUrl}/api/subscriptions/webhook/sslcommerz`,
      })

      const { error: updateError } = await admin
        .from('subscription_payments')
        .update({
          provider_reference: gateway.sessionKey || null,
        })
        .eq('id', checkout.id)
        .eq('status', 'pending')

      if (updateError) {
        throw updateError
      }

      refreshBilling()

      return {
        ok: true,
        data: {
          redirectUrl: gateway.redirectUrl,
          transactionId,
        },
      }
    } catch (gatewayError) {
      await admin
        .from('subscription_payments')
        .update({
          status: 'failed',
          gateway_status: 'SESSION_START_FAILED',
          gateway_payload: {
            message:
              gatewayError instanceof Error
                ? gatewayError.message
                : 'Gateway session failed',
          },
        })
        .eq('id', checkout.id)
        .eq('status', 'pending')

      throw gatewayError
    }
  } catch (error) {
    console.error('[subscription checkout error]', error)

    return {
      ok: false,
      error: toAppError(error).message,
    }
  }
}

const cancelSchema = z.object({
  mode: z.enum(['period_end', 'immediate']),
})

/** Admin-only guard shared by the cancel and resume actions. */
async function requireBillingAdmin() {
  const session = await requireSession('/settings/billing')
  const role = sessionRole(session)

  if (role !== 'admin' && role !== 'super_admin') {
    return {
      ok: false as const,
      error: 'Only the organization owner can manage billing.',
    }
  }

  const orgId = defaultOrgId(session)

  if (!orgId) {
    return {
      ok: false as const,
      error: 'Set up your organization before managing a plan.',
    }
  }

  return { ok: true as const, orgId }
}

/**
 * Cancels the current plan, in one of two ways.
 *
 *   period_end  keep everything, set a flag, and let the cron job at
 *               /api/cron/subscriptions drop it to free on the end date. The
 *               customer keeps what they paid for.
 *   immediate   drop to free now, giving up the rest of the paid period.
 *
 * Neither one sets status to 'cancelled' or deletes the row. An organization
 * with no non-cancelled subscription is treated as having no plan at all by
 * assertBuildingQuotaAvailable(), which would lock the owner out of their own
 * buildings. Free is a plan; no row is not.
 *
 * No refund is issued or implied. Immediate cancellation forfeits the
 * remainder, which the confirmation dialog says out loud.
 */
export async function cancelSubscription(
  input: unknown,
): Promise<ActionResult<{ mode: 'period_end' | 'immediate' }>> {
  const parsed = cancelSchema.safeParse(input)

  if (!parsed.success) {
    return invalid(parsed.error)
  }

  try {
    const guard = await requireBillingAdmin()
    if (!guard.ok) return guard

    const admin = createAdminSupabase()

    const { data: subscription, error: lookupError } = await admin
      .from('subscriptions')
      .select('id, plan, current_period_end, cancel_at_period_end')
      .eq('org_id', guard.orgId)
      .neq('status', 'cancelled')
      .maybeSingle()

    if (lookupError) throw lookupError

    if (!subscription) {
      return { ok: false, error: 'No plan found for this organization.' }
    }

    if (subscription.plan === 'free') {
      return { ok: false, error: 'You are already on the Free plan.' }
    }

    const { mode } = parsed.data

    if (mode === 'period_end') {
      if (subscription.cancel_at_period_end) {
        return { ok: false, error: 'This plan is already set to end.' }
      }

      const { error } = await admin
        .from('subscriptions')
        .update({ cancel_at_period_end: true })
        .eq('id', subscription.id)

      if (error) throw error
    } else {
      const free = limitsFor('free')

      const { error } = await admin
        .from('subscriptions')
        .update({
          plan: 'free',
          status: 'active',
          unit_limit: free.units,
          building_limit: free.buildings,
          current_period_end: null,
          cancel_at_period_end: false,
          cancelled_at: new Date().toISOString(),
          provider_reference: null,
        })
        .eq('id', subscription.id)

      if (error) throw error
    }

    await writeAuditLog({
      orgId: guard.orgId,
      action: 'subscription.cancelled',
      entityType: 'subscription',
      entityId: subscription.id,
      after: {
        mode,
        plan: subscription.plan,
        endsOn: subscription.current_period_end,
      },
    })

    refreshBilling()

    return { ok: true, data: { mode } }
  } catch (error) {
    console.error('[subscription cancel error]', error)

    return { ok: false, error: toAppError(error).message }
  }
}

/** Undoes a scheduled cancellation while the paid period is still running. */
export async function resumeSubscription(): Promise<ActionResult<null>> {
  try {
    const guard = await requireBillingAdmin()
    if (!guard.ok) return guard

    const admin = createAdminSupabase()

    const { data: subscription, error: lookupError } = await admin
      .from('subscriptions')
      .select('id, plan, cancel_at_period_end')
      .eq('org_id', guard.orgId)
      .neq('status', 'cancelled')
      .maybeSingle()

    if (lookupError) throw lookupError

    if (!subscription || !subscription.cancel_at_period_end) {
      return { ok: false, error: 'There is no scheduled cancellation to undo.' }
    }

    const { error } = await admin
      .from('subscriptions')
      .update({ cancel_at_period_end: false })
      .eq('id', subscription.id)

    if (error) throw error

    await writeAuditLog({
      orgId: guard.orgId,
      action: 'subscription.resumed',
      entityType: 'subscription',
      entityId: subscription.id,
      after: { plan: subscription.plan },
    })

    refreshBilling()

    return { ok: true, data: null }
  } catch (error) {
    console.error('[subscription resume error]', error)

    return { ok: false, error: toAppError(error).message }
  }
}