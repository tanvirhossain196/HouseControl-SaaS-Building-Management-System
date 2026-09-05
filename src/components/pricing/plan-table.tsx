'use client'

import * as React from 'react'
import { Check, Minus } from 'lucide-react'
import { PERIODS, PLANS, quote, taka, type PlanId } from '@/lib/pricing'
import { purchaseLink, SUPPORT_PHONE_DISPLAY, telLink } from '@/lib/whatsapp'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/**
 * The pricing table.
 *
 * The period selector sits above the plans rather than inside each one, so a
 * person comparing Plus against Pro is comparing them over the same
 * commitment. Every price on screen recomputes from `quote()` the moment the
 * period changes — including the figure the WhatsApp message will carry.
 */
export function PlanTable({
  organisation,
  name,
  email,
  currentPlan,
}: {
  organisation?: string | null
  name?: string | null
  email?: string | null
  currentPlan?: PlanId
}) {
  const [months, setMonths] = React.useState(6)
  const period = PERIODS.find((candidate) => candidate.months === months) ?? PERIODS[0]!

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-2 text-sm text-muted">Pay for</span>
        {PERIODS.map((option) => {
          const active = option.months === months
          return (
            <button
              key={option.months}
              type="button"
              onClick={() => setMonths(option.months)}
              aria-pressed={active}
              className={cn(
                'relative rounded-control border px-3.5 py-2 text-sm font-medium transition-colors',
                active
                  ? 'border-primary bg-primary-soft text-primary'
                  : 'border-line text-muted hover:border-ink/25 hover:text-ink',
              )}
            >
              {option.label}
              {option.discount > 0 && (
                <span
                  className={cn(
                    'ml-2 rounded-tile px-1.5 py-0.5 text-[0.7rem]',
                    active ? 'bg-primary text-primary-fg' : 'bg-paid-soft text-paid',
                  )}
                >
                  −{option.discount}%
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        {PLANS.map((plan) => {
          const priced = quote(plan.id, months)
          const isCurrent = currentPlan === plan.id

          return (
            <div
              key={plan.id}
              className={cn(
                'flex flex-col rounded-sheet border bg-surface p-7',
                plan.featured ? 'border-primary/50 shadow-panel' : 'border-line',
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold text-ink">{plan.name}</h3>
                {isCurrent ? (
                  <Badge tone="paid" dot>
                    Your plan
                  </Badge>
                ) : (
                  plan.featured && <Badge tone="accent">Most buildings pick this</Badge>
                )}
              </div>

              <p className="mt-5 flex items-baseline gap-2">
                <span className="tabular font-mono text-[2rem] font-semibold tracking-tight text-ink">
                  {plan.monthly === 0 ? '৳0' : taka(priced.effectiveMonthly)}
                </span>
                <span className="text-sm text-muted">
                  {plan.monthly === 0 ? 'forever' : 'per month'}
                </span>
              </p>

              {plan.monthly > 0 && (
                <p className="tabular mt-1 font-mono text-xs text-muted">
                  {months === 1 ? (
                    'billed monthly'
                  ) : (
                    <>
                      {taka(priced.total)} for {period.label.toLowerCase()}
                      {priced.saved > 0 && (
                        <span className="text-paid"> · save {taka(priced.saved)}</span>
                      )}
                    </>
                  )}
                </p>
              )}

              <p className="mt-4 text-sm leading-relaxed text-muted">{plan.tagline}</p>

              <ul className="mt-6 flex-1 space-y-2.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm text-ink">
                    <Check className="mt-0.5 size-4 shrink-0 text-paid" aria-hidden />
                    {feature}
                  </li>
                ))}
                {plan.missing.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2.5 text-sm text-muted"
                  >
                    <Minus className="mt-0.5 size-4 shrink-0 text-line" aria-hidden />
                    {feature}
                  </li>
                ))}
              </ul>

              {plan.monthly === 0 ? (
                <a
                  href="/sign-up"
                  className={cn(
                    buttonVariants({ variant: 'outline', block: true }),
                    'mt-7',
                  )}
                >
                  Start free
                </a>
              ) : (
                <a
                  href={purchaseLink({
                    planId: plan.id,
                    planName: plan.name,
                    months,
                    periodLabel: period.label,
                    organisation,
                    name,
                    email,
                  })}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(
                    buttonVariants({
                      variant: plan.featured ? 'primary' : 'outline',
                      block: true,
                    }),
                    'mt-7',
                  )}
                >
                  {isCurrent ? 'Extend on WhatsApp' : `Get ${plan.name} on WhatsApp`}
                </a>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-6 rounded-panel border border-line bg-surface p-5">
        <p className="text-sm text-ink">
          Payment is arranged over WhatsApp — bKash, Nagad, bank transfer or card. Send
          the message and the details come back within the hour on a working day.
        </p>
        <p className="mt-2 text-sm text-muted">
          Something urgent, or a building that has to be running today? Call{' '}
          <a href={telLink()} className="font-medium text-primary hover:underline">
            {SUPPORT_PHONE_DISPLAY}
          </a>{' '}
          instead of waiting for a reply.
        </p>
      </div>
    </div>
  )
}
