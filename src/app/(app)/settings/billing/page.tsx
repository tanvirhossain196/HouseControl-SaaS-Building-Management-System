import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  ArrowRight,
  CreditCard,
  Download,
  MessageCircle,
  Phone,
  ShieldCheck,
} from 'lucide-react'

import { pageMetadata } from '@/lib/seo'
import { requireSession } from '@/lib/auth/session'
import { defaultOrgId, sessionRole } from '@/lib/auth/guards'
import { createServerSupabase } from '@/lib/supabase/server'
import { limitsFor, planById, taka, type PlanId } from '@/lib/pricing'
import { describeSubscription, formatDay, remainingLabel } from '@/lib/subscription'
import { SUPPORT_PHONE_DISPLAY, telLink, whatsappLink } from '@/lib/whatsapp'

import { PageHeader, EmptyState } from '@/components/layout/page-header'

import { SubscriptionControls } from '@/components/pricing/subscription-controls'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'

export const metadata = pageMetadata({
  title: 'Plan and billing',
  description: 'Manage your HouseControl plan, subscription status and billing.',
  path: '/settings/billing',
  noIndex: true,
})

function subscriptionLabel(status?: string | null) {
  if (status === 'trialing') return 'Trial'
  if (status === 'active') return 'Active'
  if (status === 'past_due') return 'Payment overdue'
  if (status === 'cancelled') return 'Cancelled'
  return 'Active'
}

function subscriptionTone(status?: string | null) {
  if (status === 'past_due') return 'overdue' as const
  if (status === 'cancelled') return 'neutral' as const
  return 'paid' as const
}

export default async function BillingPage() {
  const session = await requireSession('/settings/billing')
  const role = sessionRole(session)

  const canManageBilling = role === 'admin' || role === 'super_admin'

  if (!canManageBilling) {
    redirect('/forbidden')
  }

  const orgId = defaultOrgId(session)

  if (!orgId) {
    return (
      <>
        <PageHeader
          title="Plan and billing"
          description="Choose a plan after setting up your organization."
        />

        <EmptyState
          title="No organization yet"
          body="Set up your building first. Every organization starts on the Free plan, and nothing is charged until you choose a paid plan."
          action={
            <Link href="/onboarding/building" className={buttonVariants()}>
              Set up my building
            </Link>
          }
        />
      </>
    )
  }

  const supabase = createServerSupabase()

  const [
    { data: subscription },
    { data: organisation },
    { data: buildings },
    { data: history },
  ] = await Promise.all([
    supabase
      .from('subscriptions')
      .select(
        `
          plan,
          status,
          unit_limit,
          building_limit,
          current_period_start,
          current_period_end,
          provider,
          provider_reference,
          cancel_at_period_end
        `,
      )
      .eq('org_id', orgId)
      .neq('status', 'cancelled')
      .maybeSingle(),

    supabase.from('organizations').select('name').eq('id', orgId).maybeSingle(),

    supabase.from('buildings').select('id').eq('org_id', orgId).is('archived_at', null),

    supabase
      .from('subscription_payments')
      .select('transaction_id, plan, months, amount, status, paid_at, created_at')
      .eq('org_id', orgId)
      .eq('status', 'confirmed')
      .order('created_at', { ascending: false })
      .limit(12),
  ])

  const planId = (subscription?.plan ?? 'free') as PlanId
  const plan = planById(planId)

  // One reading of the row, shared by the badge, the countdown and the cron.
  const view = describeSubscription(subscription)

  const buildingIds = (buildings ?? []).map((building) => building.id)

  const { count: unitCount } = buildingIds.length
    ? await supabase
        .from('flats')
        .select('id', {
          count: 'exact',
          head: true,
        })
        .in('building_id', buildingIds)
        .is('archived_at', null)
    : { count: 0 }

  const usedUnits = unitCount ?? 0
  const unitLimit = subscription?.unit_limit ?? limitsFor('free').units

  const usagePercent = Math.min(100, (usedUnits / Math.max(1, unitLimit)) * 100)

  const nearLimit = usedUnits >= unitLimit * 0.8
  const status = subscription?.status ?? 'active'

  const remainingUnits = Math.max(0, unitLimit - usedUnits)

  const payments = (history ?? []) as Array<{
    transaction_id: string
    plan: string
    months: number
    amount: number
    paid_at: string | null
    created_at: string
  }>

  const supportMessage = [
    'HouseControl billing support request',
    '',
    `Organisation: ${organisation?.name ?? '—'}`,
    `Email: ${session.email}`,
    `Current plan: ${plan?.name ?? 'Free'}`,
    `Subscription status: ${subscriptionLabel(status)}`,
  ].join('\n')

  return (
    <>
      <PageHeader
        title="Plan and billing"
        description="Manage your plan, usage and subscription status from one place."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)]">
        <section className="rounded-panel border border-line bg-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-title text-ink">{plan?.name ?? 'Free'}</h2>

                <Badge tone={subscriptionTone(status)} dot>
                  {subscriptionLabel(status)}
                </Badge>
              </div>

              <p className="mt-2 max-w-[56ch] text-sm text-muted">
                {plan?.tagline ??
                  'A simple plan for managing your building and residents.'}
              </p>
            </div>

            <div className="text-right">
              <p className="tabular font-mono text-2xl font-semibold text-ink">
                {plan?.monthly ? `${taka(plan.monthly)}/mo` : '৳0'}
              </p>

              {view.paid && (
                <p className="mt-1 text-xs text-muted">{remainingLabel(view)}</p>
              )}
            </div>
          </div>

          <div className="mt-6 border-t border-line pt-5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm text-muted">Units used</p>

              <p className="tabular font-mono text-sm text-ink">
                {usedUnits} of {unitLimit}
              </p>
            </div>

            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-raised">
              <div
                className={[
                  'h-full rounded-full transition-all',
                  nearLimit ? 'bg-due' : 'bg-paid',
                ].join(' ')}
                style={{
                  width: `${usagePercent}%`,
                }}
              />
            </div>

            {nearLimit ? (
              <p className="mt-2 text-xs text-due">
                You are close to your unit limit. Upgrade before adding more units.
              </p>
            ) : (
              <p className="mt-2 text-xs text-muted">
                You can add up to {remainingUnits} more unit
                {remainingUnits === 1 ? '' : 's'} on this plan.
              </p>
            )}
          </div>

          <SubscriptionControls
            planName={view.planName}
            state={view.state}
            daysLeft={view.daysLeft}
            remaining={remainingLabel(view)}
            startedOn={formatDay(view.startedOn)}
            endsOn={formatDay(view.endsOn)}
          />
        </section>

        <section className="rounded-panel border border-line bg-surface p-6">
          <div className="flex items-start gap-3">
            <div className="flex size-10 items-center justify-center rounded-control bg-paid-soft text-paid">
              <ShieldCheck className="size-5" aria-hidden />
            </div>

            <div>
              <h2 className="font-semibold text-ink">Secure billing</h2>

              <p className="mt-1 text-sm leading-relaxed text-muted">
                Your subscription status is stored against your organization, not inside
                the browser.
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-3 border-t border-line pt-5 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted">Provider</span>

              <span className="font-medium text-ink">
                {subscription?.provider ?? 'Not connected'}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-muted">Buildings</span>

              <span className="font-mono text-ink">{buildingIds.length}</span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-muted">Billing mode</span>

              <span className="font-medium text-ink">
                {planId === 'free' ? 'Free' : 'Gateway-ready'}
              </span>
            </div>
          </div>
        </section>
      </div>

      {payments.length > 0 && (
        <section className="mt-10">
          <h2 className="text-title text-ink">Billing history</h2>

          <p className="mt-1 max-w-[65ch] text-sm leading-relaxed text-muted">
            Every confirmed subscription payment, with its invoice. The same PDF was
            emailed to you when the payment cleared.
          </p>

          {/*
            overflow-x-auto, not overflow-hidden: four columns of dates and
            amounts do not fit a 360px phone, and hiding the overflow cuts the
            invoice link off the right edge with no way to reach it. Below `sm`
            the panel runs to the screen edges so the scroll is obviously a
            scroll rather than a broken layout.
          */}
          <div className="-mx-4 mt-4 w-[calc(100%+2rem)] overflow-x-auto border-y border-line bg-surface sm:mx-0 sm:w-full sm:rounded-panel sm:border">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Plan</th>
                  <th className="px-5 py-3 text-right font-medium">Amount</th>
                  <th className="px-5 py-3 text-right font-medium">Invoice</th>
                </tr>
              </thead>

              <tbody>
                {payments.map((payment) => (
                  <tr
                    key={payment.transaction_id}
                    className="border-b border-line last:border-0"
                  >
                    <td className="px-5 py-3 text-ink">
                      {formatDay((payment.paid_at ?? payment.created_at).slice(0, 10))}
                    </td>

                    <td className="px-5 py-3 text-ink">
                      {planById(payment.plan)?.name ?? payment.plan}
                      <span className="text-muted">
                        {' '}
                        · {payment.months} month
                        {payment.months === 1 ? '' : 's'}
                      </span>
                    </td>

                    <td className="tabular px-5 py-3 text-right font-mono text-ink">
                      {taka(Number(payment.amount))}
                    </td>

                    <td className="px-5 py-3 text-right">
                      <a
                        href={`/api/invoices/${payment.transaction_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-primary underline-offset-4 hover:underline"
                      >
                        <Download className="size-3.5" aria-hidden />
                        PDF
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/*
        The plans themselves live on Pricing. This page is for the plan you
        already have — what it covers, what you paid, when it ends — and a wall
        of prices on top of that buries the receipt someone came here to find.
      */}
      <section className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-line bg-surface px-5 py-4">
          <div>
            <p className="text-sm font-medium text-ink">Need more room?</p>
            <p className="mt-0.5 text-sm text-muted">
              Compare plans and upgrade whenever you like.
            </p>
          </div>

          <Link
            href="/settings/plans"
            className="inline-flex items-center gap-1.5 rounded-control border border-line bg-raised px-3 py-2 text-sm text-ink transition-colors hover:border-ink/25"
          >
            See pricing
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      </section>

      <section className="mt-10 border-t border-line pt-8">
        <h2 className="text-title text-ink">Need billing support?</h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:max-w-2xl">
          <a
            href={whatsappLink(supportMessage)}
            target="_blank"
            rel="noreferrer"
            className="flex items-start gap-3 rounded-panel border border-line bg-surface p-5 transition-colors hover:border-ink/25"
          >
            <MessageCircle className="mt-0.5 size-5 shrink-0 text-paid" aria-hidden />

            <span>
              <span className="block font-medium text-ink">WhatsApp support</span>

              <span className="mt-1 block text-sm leading-relaxed text-muted">
                Ask about upgrades, renewals or manual payment instructions.
              </span>
            </span>
          </a>

          <a
            href={telLink()}
            className="flex items-start gap-3 rounded-panel border border-line bg-surface p-5 transition-colors hover:border-ink/25"
          >
            <Phone className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />

            <span>
              <span className="block font-medium text-ink">
                Call {SUPPORT_PHONE_DISPLAY}
              </span>

              <span className="mt-1 block text-sm leading-relaxed text-muted">
                For urgent billing or building activation support.
              </span>
            </span>
          </a>
        </div>

        <div className="mt-6 flex items-start gap-2 rounded-control border border-line bg-raised px-4 py-3 text-xs leading-relaxed text-muted">
          <CreditCard className="mt-0.5 size-3.5 shrink-0" aria-hidden />

          <p>
            Automatic checkout will use the selected plan, billing period, organization
            and payment reference. The webhook will update the subscription status after
            the gateway confirms the payment.
          </p>
        </div>
      </section>
    </>
  )
}