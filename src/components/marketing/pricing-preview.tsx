import Link from 'next/link'
import { Check } from 'lucide-react'
import { plans } from '@/content/pricing'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Section } from './section'

export function PricingPreview() {
  return (
    <Section
      id="pricing"
      heading="Priced per building, not per person"
      intro="Add as many residents as the building holds. You pay for the building, once a month."
    >
      <div className="grid gap-4 md:grid-cols-2 lg:max-w-4xl">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={cn(
              'flex flex-col rounded-sheet border bg-surface p-7',
              plan.featured ? 'border-primary/40 shadow-panel' : 'border-line',
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold text-ink">{plan.name}</h3>
              {plan.featured && (
                <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent">
                  Most buildings pick this
                </span>
              )}
            </div>
            <p className="mt-5 flex items-baseline gap-2">
              <span className="tabular font-mono text-[2rem] font-semibold tracking-tight text-ink">
                {plan.price}
              </span>
              <span className="text-sm text-muted">{plan.cadence}</span>
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted">{plan.pitch}</p>
            <ul className="mt-6 flex-1 space-y-2.5">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-ink">
                  <Check className="mt-0.5 size-4 shrink-0 text-paid" aria-hidden />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/contact"
              className={cn(
                buttonVariants({
                  variant: plan.featured ? 'primary' : 'outline',
                  block: true,
                }),
                'mt-7',
              )}
            >
              {plan.cta}
            </Link>
          </div>
        ))}
      </div>
      <p className="mt-6 text-sm text-muted">
        Payment gateway fees are charged by the provider, not by us.{' '}
        <Link href="/faq" className="text-primary hover:underline">
          Read the full pricing FAQ
        </Link>
      </p>
    </Section>
  )
}
