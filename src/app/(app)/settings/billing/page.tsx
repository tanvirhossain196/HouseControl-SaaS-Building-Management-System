import Link from 'next/link'
import { CreditCard, MessageCircle, Phone } from 'lucide-react'
import { pageMetadata } from '@/lib/seo'
import { requireSession } from '@/lib/auth/session'
import { defaultOrgId } from '@/lib/auth/guards'
import { createServerSupabase } from '@/lib/supabase/server'
import { planById, taka, type PlanId } from '@/lib/pricing'
import { SUPPORT_PHONE_DISPLAY, telLink, whatsappLink } from '@/lib/whatsapp'
import { PageHeader, EmptyState } from '@/components/layout/page-header'
import { PlanTable } from '@/components/pricing/plan-table'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'

export const metadata = pageMetadata({
  title: 'Plan and billing',
  description: 'What you are on, what it covers, and how to change it.',
  path: '/settings/billing',
  noIndex: true,
})

export default async function BillingPage() {
  const session = await requireSession('/settings/billing')
  const orgId = defaultOrgId(session)

  if (!orgId) {
    return (
      <>
        <PageHeader title="Plan and billing" />
        <EmptyState
          title="No organization yet"
          body="Set up your building first. Everything starts on the Free plan, and nothing is charged until you ask for more."
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

  const [{ data: subscription }, { data: organisation }, { data: buildings }] =
    await Promise.all([
      supabase
        .from('subscriptions')
        .select('plan, status, unit_limit, building_limit, current_period_end')
        .eq('org_id', orgId)
        .neq('status', 'cancelled')
        .maybeSingle(),
      supabase.from('organizations').select('name').eq('id', orgId).maybeSingle(),
      supabase.from('buildings').select('id').eq('org_id', orgId).is('archived_at', null),
    ])

  const planId = (subscription?.plan ?? 'free') as PlanId
  const plan = planById(planId)

  const buildingIds = (buildings ?? []).map((building) => building.id)
  const { count: unitCount } = buildingIds.length
    ? await supabase
        .from('flats')
        .select('id', { count: 'exact', head: true })
        .in('building_id', buildingIds)
        .is('archived_at', null)
    : { count: 0 }

  const used = unitCount ?? 0
  const limit = subscription?.unit_limit ?? 12
  const nearLimit = used >= limit * 0.8

  return (
    <>
      <PageHeader
        title="Plan and billing"
        description="What you are on, what it covers, and how to change it."
      />

      <div className="rounded-panel border border-line bg-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-title text-ink">{plan?.name ?? 'Free'}</h2>
              <Badge tone={planId === 'free' ? 'neutral' : 'paid'} dot>
                {subscription?.status ?? 'active'}
              </Badge>
            </div>
            <p className="mt-2 max-w-[52ch] text-sm text-muted">{plan?.tagline}</p>
          </div>

          <div className="text-right">
            <p className="tabular font-mono text-2xl font-semibold text-ink">
              {plan?.monthly ? `${taka(plan.monthly)}/mo` : '৳0'}
            </p>
            {subscription?.current_period_end && (
              <p className="text-xs text-muted">
                Paid until {subscription.current_period_end}
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 border-t border-line pt-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm text-muted">Units used</p>
            <p className="tabular font-mono text-sm text-ink">
              {used} of {limit}
            </p>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-raised">
            <div
              className={nearLimit ? 'h-full bg-due' : 'h-full bg-paid'}
              style={{ width: `${Math.min(100, (used / Math.max(1, limit)) * 100)}%` }}
            />
          </div>
          {nearLimit && (
            <p className="mt-2 text-xs text-due">
              Close to the limit. Adding units past it asks you to upgrade — nothing
              already here stops working.
            </p>
          )}
        </div>
      </div>

      <section className="mt-10">
        <h2 className="text-title text-ink">Change your plan</h2>
        <p className="mt-1 max-w-[62ch] text-sm text-muted">
          Payment is arranged over WhatsApp for now. Pick a plan and a period, and the
          message arrives with your organization and the exact figure already filled in.
        </p>
        <div className="mt-6">
          <PlanTable
            currentPlan={planId}
            organisation={organisation?.name}
            name={session.profile?.full_name}
            email={session.email}
          />
        </div>
      </section>

      <section className="mt-10 border-t border-line pt-8">
        <h2 className="text-title text-ink">Getting hold of us</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:max-w-2xl">
          <a
            href={whatsappLink(
              `HouseControl — I have a question about my plan.\n\nOrganisation: ${organisation?.name ?? '—'}\nEmail: ${session.email}`,
            )}
            target="_blank"
            rel="noreferrer"
            className="flex items-start gap-3 rounded-panel border border-line bg-surface p-5 transition-colors hover:border-ink/25"
          >
            <MessageCircle className="mt-0.5 size-5 shrink-0 text-paid" aria-hidden />
            <span>
              <span className="block font-medium text-ink">WhatsApp</span>
              <span className="block text-sm text-muted">
                Billing, upgrades and payment details. Replies within the hour on a
                working day.
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
              <span className="block text-sm text-muted">
                For anything urgent — a building that has to be running today.
              </span>
            </span>
          </a>
        </div>

        <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-muted">
          <CreditCard className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Card and bKash payment inside the app is built and waiting on gateway
          credentials. Once those are in place this page pays directly and the WhatsApp
          step disappears.
        </p>
      </section>
    </>
  )
}
