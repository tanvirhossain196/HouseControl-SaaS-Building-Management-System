import Link from 'next/link'

import { pageMetadata } from '@/lib/seo'
import { site } from '@/lib/site'
import { SUPPORT_PHONE_DISPLAY, telLink, whatsappLink } from '@/lib/whatsapp'
import { Section } from '@/components/marketing/section'

export const metadata = pageMetadata({
  title: 'Return and refund policy',
  description:
    'When a HouseControl subscription payment is refunded, how long it takes, and how to ask.',
  path: '/refund',
})

/**
 * The refund policy.
 *
 * A payment gateway will not approve a merchant without one, but that is not
 * the reason to write it carefully. Someone reads this after money has left
 * their account and something has gone wrong, so it says what actually happens
 * and how long it takes rather than reserving every right and promising
 * nothing.
 *
 * It covers subscriptions only. Rent collected through the platform belongs to
 * a landlord, not to us, and is settled between the resident and their building
 * — saying otherwise here would be claiming an authority we do not have.
 */
export default function RefundPage() {
  const updated = '10 September 2026'

  return (
    <Section
      heading="Return and refund policy"
      intro={`How refunds work for ${site.name} subscriptions. Last updated ${updated}.`}
    >
      <div className="max-w-[68ch] space-y-8 text-sm leading-relaxed text-muted">
        <div>
          <h3 className="text-title text-ink">What this covers</h3>

          <p className="mt-2">
            {site.name} sells subscription plans to building owners. This policy
            covers those payments and nothing else. Rent and shared bills that
            residents pay through the platform are money owed to their building,
            not to us; a dispute about rent is settled between the resident, the
            flat moderator and the owner, and we do not hold or return it.
          </p>

          <p className="mt-2">
            Because a subscription is software rather than goods, there is
            nothing to send back. &ldquo;Return&rdquo; here means cancelling the
            plan.
          </p>
        </div>

        <div>
          <h3 className="text-title text-ink">When we refund in full</h3>

          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li>
              You were charged twice for the same plan and period. We refund the
              duplicate without being asked, as soon as we find it.
            </li>
            <li>
              The payment succeeded but the plan never activated, and we cannot
              activate it for you.
            </li>
            <li>
              You bought the wrong plan or the wrong number of months and tell us
              within <strong className="text-ink">7 days</strong>, provided the
              organisation has stayed inside the free allowance in the meantime.
            </li>
            <li>
              A charge you did not authorise, once we have confirmed it with the
              gateway.
            </li>
          </ul>
        </div>

        <div>
          <h3 className="text-title text-ink">When we do not</h3>

          <p className="mt-2">
            After the first 7 days, a plan that has been used is not refunded for
            the time already run. Cancelling stops the plan; it does not return
            what the months so far cost.
          </p>

          <p className="mt-2">
            Cancelling in the middle of a paid period forfeits the remainder. The
            cancellation screen says so before you confirm, and the alternative —
            letting the plan run to its end date — is offered beside it and costs
            you nothing extra.
          </p>

          <p className="mt-2">
            Nothing renews on its own. A plan is bought for a fixed number of
            months and then stops, so there is no automatic charge to be
            surprised by and none to refund.
          </p>
        </div>

        <div>
          <h3 className="text-title text-ink">How long it takes</h3>

          <p className="mt-2">
            We decide within <strong className="text-ink">3 working days</strong>{' '}
            of hearing from you and send approved refunds to the gateway the same
            day. From there it depends on how you paid:
          </p>

          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li>bKash, Nagad and other mobile wallets: usually 3 to 7 working days</li>
            <li>Cards: usually 7 to 14 working days, set by your bank</li>
          </ul>

          <p className="mt-2">
            The money returns to the account it came from. We cannot send it
            somewhere else, and we do not refund in cash.
          </p>
        </div>

        <div>
          <h3 className="text-title text-ink">How to ask</h3>

          <p className="mt-2">
            Write to us on WhatsApp or call, with the invoice number from the
            receipt we emailed you. It starts with <code>INV-</code> and appears
            on Plan &amp; billing too. With that number we can usually answer the
            same day; without it we have to go looking.
          </p>

          <div className="mt-4 flex flex-wrap gap-3">
            <a
              href={whatsappLink('Hello, I would like to ask about a refund. Invoice: ')}
              target="_blank"
              rel="noreferrer"
              className="rounded-control border border-line bg-surface px-4 py-2 text-sm text-ink transition-colors hover:border-ink/25"
            >
              WhatsApp
            </a>

            <a
              href={telLink()}
              className="rounded-control border border-line bg-surface px-4 py-2 text-sm text-ink transition-colors hover:border-ink/25"
            >
              Call {SUPPORT_PHONE_DISPLAY}
            </a>
          </div>
        </div>

        <p className="border-t border-line pt-6 text-xs">
          This policy sits alongside our{' '}
          <Link href="/terms" className="text-primary underline-offset-4 hover:underline">
            terms
          </Link>{' '}
          and{' '}
          <Link
            href="/privacy"
            className="text-primary underline-offset-4 hover:underline"
          >
            privacy policy
          </Link>
          . Where they disagree, the terms decide.
        </p>
      </div>
    </Section>
  )
}