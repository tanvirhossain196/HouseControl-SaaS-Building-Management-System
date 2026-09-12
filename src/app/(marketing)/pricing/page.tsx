import Link from 'next/link'

import { pageMetadata } from '@/lib/seo'
import { PERIODS } from '@/lib/pricing'
import { PlanTable } from '@/components/pricing/plan-table'
import { Section } from '@/components/marketing/section'
import { FaqAccordion } from '@/components/marketing/faq-accordion'
import { buttonVariants } from '@/components/ui/button'

export const metadata = pageMetadata({
  title: 'Pricing',
  description:
    'Start free with one building and upgrade when your property grows. Flexible monthly and yearly plans with future online payment support.',
  path: '/pricing',
})

const pricingFaqs = [
  {
    q: 'Is the Free plan a trial?',
    a: 'No. The Free plan is available for one building and up to twelve units for as long as you need it. Your data remains yours and is not deleted.',
  },
  {
    q: 'What happens if I go over the unit limit?',
    a: 'Nothing breaks and nothing is deleted. You will be asked to upgrade before adding units beyond your current plan limit. Existing buildings, residents, dues and payment records continue to work.',
  },
  {
    q: 'How will online payment work?',
    a: 'After selecting a paid plan, billing will be managed from Settings → Billing. The system is prepared for automatic gateway checkout, payment verification, subscription activation and webhook-based renewal updates.',
  },
  {
    q: 'Can I change plans later?',
    a: 'Yes. You can upgrade when your property grows. Upgrades can be activated immediately, while downgrades can take effect after the current paid period ends.',
  },
  {
    q: 'Is the price per building or per person?',
    a: 'Plans are priced per organization and property usage, not per individual resident. You can add residents, moderators and guards according to your plan limits.',
  },
  {
    q: 'What happens if I stop paying?',
    a: 'Your data is not deleted. Paid features may be restricted after the subscription period ends, while your organization remains available for renewal.',
  },
  {
    q: 'Will payment gateway support be added?',
    a: 'Yes. The subscription structure includes provider, provider reference, subscription status and billing period fields, so gateways such as SSLCommerz, bKash or other providers can be connected later.',
  },
]

export default function PricingPage() {
  const bestDiscount = PERIODS.reduce(
    (maximum, period) => Math.max(maximum, period.discount),
    0,
  )

  return (
    <>
      <Section
        heading="Priced for your building, not per person"
        intro={`Start free and upgrade when you need more control. Choose monthly or longer commitments and save up to ${bestDiscount}%.`}
      >
        <PlanTable />

        <div className="mt-8 flex flex-col items-center justify-center gap-3 text-center sm:flex-row">
          <Link
            href="/sign-up?next=%2Fsettings%2Fbilling"
            className={buttonVariants({
              variant: 'primary',
              size: 'sm',
            })}
          >
            Get started
          </Link>

          <Link
            href="/sign-in?next=%2Fsettings%2Fbilling"
            className={buttonVariants({
              variant: 'outline',
              size: 'sm',
            })}
          >
            I already have an account
          </Link>
        </div>

        <p className="mt-4 text-center text-xs text-muted">
          You can create an account first and activate a paid plan later from
          Settings → Billing.
        </p>
      </Section>

      <Section
        heading="What each plan is for"
        className="rule bg-surface"
      >
        <div className="grid gap-8 md:grid-cols-3">
          <div>
            <h3 className="font-semibold text-ink">
              Free
            </h3>

            <p className="mt-2 max-w-[42ch] text-sm leading-relaxed text-muted">
              For one small building with basic resident, rent and dues
              management. It is a permanent free plan, not a temporary trial.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-ink">
              Plus
            </h3>

            <p className="mt-2 max-w-[42ch] text-sm leading-relaxed text-muted">
              For buildings that need smoother rent collection, resident
              communication, payment records and automated billing workflows.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-ink">
              Pro
            </h3>

            <p className="mt-2 max-w-[42ch] text-sm leading-relaxed text-muted">
              For larger organizations managing multiple buildings, moderators,
              audit history, landlord records and advanced operational controls.
            </p>
          </div>
        </div>
      </Section>

      <Section heading="How subscription activation works">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-panel border border-line bg-surface p-5">
            <p className="text-sm font-semibold text-primary">
              01
            </p>

            <h3 className="mt-2 font-semibold text-ink">
              Choose a plan
            </h3>

            <p className="mt-2 text-sm leading-relaxed text-muted">
              Select Free, Plus or Pro and choose your billing period.
            </p>
          </div>

          <div className="rounded-panel border border-line bg-surface p-5">
            <p className="text-sm font-semibold text-primary">
              02
            </p>

            <h3 className="mt-2 font-semibold text-ink">
              Complete payment
            </h3>

            <p className="mt-2 text-sm leading-relaxed text-muted">
              Future gateway checkout will securely create a payment reference
              and confirm the transaction through a webhook.
            </p>
          </div>

          <div className="rounded-panel border border-line bg-surface p-5">
            <p className="text-sm font-semibold text-primary">
              03
            </p>

            <h3 className="mt-2 font-semibold text-ink">
              Features activate
            </h3>

            <p className="mt-2 text-sm leading-relaxed text-muted">
              After verified payment, the organization subscription becomes
              active and the plan limits are applied automatically.
            </p>
          </div>
        </div>
      </Section>

      <Section heading="Questions about pricing">
        <FaqAccordion items={pricingFaqs} />

        <p className="mt-8 text-sm text-muted">
          Something not answered here?{' '}
          <Link
            href="/contact"
            className="text-primary hover:underline"
          >
            Ask us
          </Link>
          .
        </p>
      </Section>
    </>
  )
}