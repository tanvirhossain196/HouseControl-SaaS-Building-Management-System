import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { PERIODS, limitsFor } from '@/lib/pricing'
import { PlanTable } from '@/components/pricing/plan-table'
import { Section } from './section'

/** The landing page's pricing block: the real table, not a summary of it. */
export function PricingPreview() {
  const best = PERIODS.reduce((max, period) => Math.max(max, period.discount), 0)

  // Read from the price list rather than written out, so changing a plan's
  // allowance never leaves the landing page advertising the old number.
  const freeUnits = limitsFor('free').units

  return (
    <Section
      id="pricing"
      heading="Priced per building, not per person"
      intro={`Free for one building up to ${freeUnits} units. Plus and Pro add online payments, SMS and reports — with up to ${best}% off if you pay for longer.`}
    >
      <PlanTable />

      <p className="mt-6 text-sm text-muted">
        <Link
          href="/pricing"
          className="inline-flex items-center gap-1.5 text-primary hover:underline"
        >
          What each plan is for
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </p>
    </Section>
  )
}