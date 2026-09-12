import Link from 'next/link'
import { ArrowRight, ShieldCheck, TrendingUp } from 'lucide-react'

import { pageMetadata } from '@/lib/seo'
import { requireSession } from '@/lib/auth/session'
import { defaultOrgId, sessionRole } from '@/lib/auth/guards'
import { forbidden } from '@/lib/errors'
import { createServerSupabase } from '@/lib/supabase/server'
import { PERIODS, limitsFor, planById, quote, taka, type PlanId } from '@/lib/pricing'
import { describeSubscription, formatDay, remainingLabel } from '@/lib/subscription'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/layout/page-header'
import { PlanTable } from '@/components/pricing/plan-table'

export const metadata = pageMetadata({
  title: 'Pricing',
  description: 'Compare plans and upgrade your organization.',
  path: '/settings/plans',
  noIndex: true,
})

/**
 * Choosing a plan, kept apart from having one.
 *
 * Plan & billing answers "what am I on, what have I paid, when does it end".
 * This page answers "what else could I be on" — and answers it against the
 * organization's real numbers, because the only useful version of that question
 * is "would the next plan fit what I actually have".
 *
 * Owners only. A moderator cannot buy a plan and a resident has no business
 * seeing what the building costs to run, so the page refuses them outright
 * rather than showing prices with the buttons removed.
 */
export default async function PlansPage() {
  const session = await requireSession('/settings/plans')
  const role = sessionRole(session)

  if (role !== 'admin' && role !== 'super_admin') {
    throw forbidden('Only the organization owner can manage the plan.')
  }

  const orgId = defaultOrgId(session)
  const supabase = createServerSupabase()

  const [{ data: subscription }, { data: organisation }, { data: buildings }] =
    await Promise.all([
      orgId
        ? supabase
            .from('subscriptions')
            .select(
              'plan, status, current_period_start, current_period_end, cancel_at_period_end',
            )
            .eq('org_id', orgId)
            .neq('status', 'cancelled')
            .maybeSingle()
        : Promise.resolve({ data: null }),
      orgId
        ? supabase.from('organizations').select('name').eq('id', orgId).maybeSingle()
        : Promise.resolve({ data: null }),
      orgId
        ? supabase
            .from('buildings')
            .select('id')
            .eq('org_id', orgId)
            .is('archived_at', null)
        : Promise.resolve({ data: [] }),
    ])

  const buildingIds = (buildings ?? []).map((building) => building.id)

  const { count: unitCount } = buildingIds.length
    ? await supabase
        .from('flats')
        .select('id', { count: 'exact', head: true })
        .in('building_id', buildingIds)
        .is('archived_at', null)
    : { count: 0 }

  const planId = (subscription?.plan ?? 'free') as PlanId
  const plan = planById(planId)
  const limits = limitsFor(planId)
  const view = describeSubscription(subscription)

  const usedUnits = unitCount ?? 0
  const usedBuildings = buildingIds.length

  const unitShare = limits.units > 0 ? (usedUnits / limits.units) * 100 : 0
  const tight = unitShare >= 80 || usedBuildings >= limits.buildings

  // What a year costs on each plan, so the discount is a number not a claim.
  const yearly = PERIODS.find((period) => period.months === 12)

  return (
    /*
    No container of its own. The app shell's <main> already centres to 1600px
    and sets the padding, so a wrapper here only narrows the page and pads it
    twice — which is why this screen looked cramped next to Flats and Dues.
  */
    <>
      <PageHeader
        title="Pricing"
        description="Every plan includes the free allowance. Pay for longer and the rate drops."
      />

      {/* ------------------------------------------------- where you are now */}
      <section className="mt-6 rounded-panel border border-line bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted">
              {organisation?.name ?? 'Your organization'} is on
            </p>
            <p className="mt-0.5 text-title text-ink">{plan?.name ?? 'Free'}</p>
          </div>

          <div className="text-right">
            <p className="text-sm text-ink">{remainingLabel(view)}</p>
            {view.endsOn && (
              <p className="mt-0.5 text-xs text-muted">Ends {formatDay(view.endsOn)}</p>
            )}
          </div>
        </div>

        <div className="mt-5 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
          <Usage label="Units" used={usedUnits} limit={limits.units} share={unitShare} />
          <Usage
            label="Buildings"
            used={usedBuildings}
            limit={limits.buildings}
            share={limits.buildings > 0 ? (usedBuildings / limits.buildings) * 100 : 0}
          />
        </div>

        {tight && (
          <p className="mt-4 flex items-start gap-2 rounded-control border border-due/30 bg-due-soft px-4 py-3 text-sm leading-relaxed text-ink">
            <TrendingUp className="mt-0.5 size-4 shrink-0 text-due" aria-hidden />
            You are close to what this plan covers. Nothing you already have stops working
            when you reach the limit — only adding more does.
          </p>
        )}

        <Link
          href="/settings/billing"
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline"
        >
          Plan &amp; billing history
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </section>

      {/* ------------------------------------------------------- the plans */}
      <section className="mt-10">
        <h2 className="text-title text-ink">Plans</h2>

        <p className="mt-1 max-w-[62ch] text-sm leading-relaxed text-muted">
          Priced per building rather than per person, so inviting every resident costs
          nothing.
        </p>

        <div className="mt-6">
          <PlanTable
            currentPlan={planId}
            organisation={organisation?.name}
            name={session.profile?.full_name}
            email={session.email}
            enableCheckout
          />
        </div>
      </section>

      {/* ------------------------------------------- what the periods save */}
      <section className="mt-10">
        <h2 className="text-title text-ink">Paying for longer</h2>

        <p className="mt-1 max-w-[62ch] text-sm leading-relaxed text-muted">
          The whole term is charged once, at the start. There is no instalment plan and no
          card kept on file.
        </p>

        <div className="mt-4 overflow-hidden rounded-panel border border-line bg-surface">
          <table className="w-full min-w-[28rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-5 py-3 font-medium">Term</th>
                <th className="px-5 py-3 text-right font-medium">Plus</th>
                <th className="px-5 py-3 text-right font-medium">Pro</th>
                <th className="px-5 py-3 text-right font-medium">You save</th>
              </tr>
            </thead>

            <tbody>
              {PERIODS.map((period) => {
                const plus = quote('plus', period.months)
                const pro = quote('pro', period.months)

                return (
                  <tr key={period.months} className="border-b border-line last:border-0">
                    <td className="px-5 py-3 text-ink">{period.label}</td>
                    <td className="tabular px-5 py-3 text-right font-mono text-ink">
                      {taka(plus.total)}
                    </td>
                    <td className="tabular px-5 py-3 text-right font-mono text-ink">
                      {taka(pro.total)}
                    </td>
                    <td
                      className={cn(
                        'px-5 py-3 text-right text-xs',
                        period.discount > 0 ? 'text-paid' : 'text-muted',
                      )}
                    >
                      {period.discount > 0 ? `${period.discount}%` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {yearly && (
          <p className="mt-3 text-xs text-muted">
            A year of Plus at {taka(quote('plus', 12).total)} works out at{' '}
            {taka(Math.round(quote('plus', 12).total / 12))} a month, against{' '}
            {taka(quote('plus', 1).total)} paid monthly.
          </p>
        )}
      </section>

      {/* --------------------------------------------------- the fine print */}
      <section className="mt-10 grid gap-4 sm:grid-cols-2">
        <Note
          title="Nothing renews on its own"
          body="A plan is bought for a fixed number of months and then it stops. You are never charged again without buying again."
        />
        <Note
          title="Your data stays put"
          body="When a plan ends, every flat, resident and receipt is still there. Only adding more is stopped until you buy again."
        />
        <Note
          title="Cancel whenever"
          body="Stop at the end of the term you paid for, or immediately and forfeit the rest. The choice is on the billing page."
        />
        <Note
          title="Refunds"
          body="Duplicate charges and plans that never activated are refunded in full. The policy sets out the rest."
          href="/refund"
          hrefLabel="Read the refund policy"
        />
      </section>
    </>
  )
}

function Usage({
  label,
  used,
  limit,
  share,
}: {
  label: string
  used: number
  limit: number
  share: number
}) {
  const full = share >= 100

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-muted">{label}</p>
        <p className="tabular font-mono text-sm text-ink">
          {used} <span className="text-muted">of {limit}</span>
        </p>
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-raised">
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-500',
            full ? 'bg-overdue' : share >= 80 ? 'bg-due' : 'bg-paid',
          )}
          style={{ width: `${Math.min(100, share)}%` }}
        />
      </div>
    </div>
  )
}

function Note({
  title,
  body,
  href,
  hrefLabel,
}: {
  title: string
  body: string
  href?: string
  hrefLabel?: string
}) {
  return (
    <div className="flex items-start gap-3 rounded-panel border border-line bg-surface p-5">
      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-paid" aria-hidden />

      <div>
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>

        {href && (
          <Link
            href={href}
            className="mt-2 inline-flex items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline"
          >
            {hrefLabel ?? 'Read more'}
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        )}
      </div>
    </div>
  )
}
