import Link from 'next/link'
import { pageMetadata } from '@/lib/seo'
import { PERIODS } from '@/lib/pricing'
import { PlanTable } from '@/components/pricing/plan-table'
import { Section } from '@/components/marketing/section'
import { FaqAccordion } from '@/components/marketing/faq-accordion'

export const metadata = pageMetadata({
  title: 'Pricing',
  description:
    'Free for one building up to 12 units. Plus at ৳500 a month, Pro at ৳1,000, with up to 20% off longer commitments.',
  path: '/pricing',
})

const pricingFaqs = [
  {
    q: 'Is the Free plan a trial?',
    a: 'No. One building and twelve units, for as long as you want it. Most family-owned walk-ups never need more than that, and charging them for it would be charging for nothing.',
  },
  {
    q: 'What happens if I go over the unit limit?',
    a: 'Nothing breaks and nothing is deleted. Adding the thirteenth unit asks you to upgrade; everything already there keeps working, including the rent you have already billed.',
  },
  {
    q: 'How do I pay?',
    a: 'Over WhatsApp for now — bKash, Nagad, bank transfer or card. You get a receipt, and the plan is switched on the same day. Card payment inside the app is being built.',
  },
  {
    q: 'Can I change plans later?',
    a: 'Yes, in either direction. Moving up takes effect immediately; moving down takes effect at the end of what you have paid for, so you never lose time you bought.',
  },
  {
    q: 'Is the price per building or per person?',
    a: 'Per organization. Add every resident, moderator and guard the building has — you are never charged for another person.',
  },
  {
    q: 'What if I stop paying?',
    a: 'The account drops to Free rather than closing. Your data stays; the features above the Free limit stop until you renew. Nothing is deleted for non-payment.',
  },
]

export default function PricingPage() {
  const best = PERIODS.reduce((max, period) => Math.max(max, period.discount), 0)

  return (
    <>
      <Section
        heading="Priced per building, not per person"
        intro={`Start free and stay free if one building is all you have. Pay by the month, or commit for longer and take up to ${best}% off.`}
      >
        <PlanTable />
      </Section>

      <Section heading="What each plan is for" className="rule bg-surface">
        <div className="grid gap-8 md:grid-cols-3">
          <div>
            <h3 className="font-semibold text-ink">Free</h3>
            <p className="mt-2 max-w-[42ch] text-sm leading-relaxed text-muted">
              One building you own and live near. Rent is collected by bKash and confirmed
              by you, the guard writes in a book, and what you want is the arguing to
              stop. This covers all of that.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-ink">Plus</h3>
            <p className="mt-2 max-w-[42ch] text-sm leading-relaxed text-muted">
              The same building, but you would rather the rent arrived on its own.
              Residents pay online, receipts issue themselves, and the overdue list
              becomes a text message rather than a phone call.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-ink">Pro</h3>
            <p className="mt-2 max-w-[42ch] text-sm leading-relaxed text-muted">
              More than one building, and other people running them for you. The audit log
              and the landlord rent records are what this tier is really for — knowing who
              changed what while you were not looking.
            </p>
          </div>
        </div>
      </Section>

      <Section heading="Questions about paying">
        <FaqAccordion items={pricingFaqs} />
        <p className="mt-8 text-sm text-muted">
          Something not answered here?{' '}
          <Link href="/contact" className="text-primary hover:underline">
            Ask us
          </Link>
          .
        </p>
      </Section>
    </>
  )
}
