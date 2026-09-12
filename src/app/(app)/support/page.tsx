import Link from 'next/link'
import {
  ArrowRight,
  Banknote,
  Building2,
  CreditCard,
  LifeBuoy,
  Mail,
  MessageCircle,
  Phone,
  Users,
} from 'lucide-react'

import { pageMetadata } from '@/lib/seo'
import { requireSession } from '@/lib/auth/session'
import { sessionRole } from '@/lib/auth/guards'
import { roleLabels } from '@/lib/auth/permissions'
import { site } from '@/lib/site'
import { SUPPORT_PHONE_DISPLAY, telLink, whatsappLink } from '@/lib/whatsapp'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { InstallApp } from '@/components/layout/install-app'

export const metadata = pageMetadata({
  title: 'Support',
  description: 'Get help with your building, your rent or your account.',
  path: '/support',
  noIndex: true,
})

type Topic = {
  question: string
  answer: string
  href?: string
  cta?: string
  /** Roles this actually applies to. Omitted means everyone. */
  roles?: Array<'owner' | 'moderator' | 'resident'>
}

type Section = {
  title: string
  icon: typeof Banknote
  topics: Topic[]
}

/**
 * The questions people arrive with, grouped by what they are about.
 *
 * Written as questions rather than feature names, because somebody opening
 * support is not looking for "the remittance ledger" — they are looking for
 * where their rent went. The answer comes first and the link second: most of
 * these are settled by understanding the rule, not by visiting a page.
 *
 * Everything here is a rule the app actually enforces. A help page that
 * describes intentions rather than behaviour is worse than none, because it
 * teaches people to distrust it.
 */
const SECTIONS: Section[] = [
  {
    title: 'Rent and payments',
    icon: Banknote,
    topics: [
      {
        question: 'I paid, but my balance has not changed',
        answer:
          'Recording a payment tells your moderator it arrived; it does not clear anything on its own. The balance moves when they confirm it, and your receipt is issued at the same moment.',
        href: '/remittances',
        cta: 'See what is waiting',
        roles: ['resident', 'moderator'],
      },
      {
        question: 'A payment is waiting on me',
        answer:
          'Anything a resident records sits in your queue until you accept or reject it. Rejecting asks for a reason, and they see it — "rejected" on its own tells them nothing about what to fix.',
        href: '/remittances',
        cta: 'Open the queue',
        roles: ['moderator', 'owner'],
      },
      {
        question: 'When does a charge become overdue?',
        answer:
          'On the 11th of the month it belongs to, whatever day it was billed. Before that it shows as due or late in amber. Billing on the 7th does not buy anyone extra time.',
      },
      {
        question: 'Rent was not billed this month',
        answer:
          'Billing runs on the 1st for every building, and a flat is skipped when it has no rent set, nobody living in it, or no moderator. Bill a month by hand at any time — running it twice creates nothing the second time.',
        href: '/control',
        cta: 'Bill a month',
        roles: ['owner', 'moderator'],
      },
    ],
  },
  {
    title: 'Handovers',
    icon: Users,
    topics: [
      {
        question: 'Why do I owe the full rent when a resident has not paid?',
        answer:
          'A handover is the whole rent of the flats you cover, not what you managed to collect. Chasing what is short is your side of the arrangement, and the shortfall stays visible on the resident who owes it.',
        roles: ['moderator'],
      },
      {
        question: 'Can I change when a moderator has to hand over?',
        answer:
          'Yes, and after the month is billed rather than only at the moment of billing. The date is on the handover schedule, on the building page.',
        href: '/control',
        cta: 'Open the schedule',
        roles: ['owner'],
      },
      {
        question: 'What proof is there that money changed hands?',
        answer:
          'Every confirmed handover issues a receipt in its own HR- series, naming who confirmed it and both dates — the day it was handed over and the day it was accepted. Most disputes are about the gap between those two.',
      },
    ],
  },
  {
    title: 'Residents and flats',
    icon: Building2,
    topics: [
      {
        question: 'Someone needs access',
        answer:
          'Invite them by email. The invite link is on the same page if you would rather send it yourself through WhatsApp.',
        href: '/admin/team',
        cta: 'Send an invite',
        roles: ['owner'],
      },
      {
        question: 'A resident is moving to another flat',
        answer:
          'Move them from the resident list rather than removing and re-inviting. Their unpaid charges stay on the old flat, because a move is not a way to clear a balance.',
        href: '/admin/residents',
        cta: 'Open residents',
        roles: ['owner', 'moderator'],
      },
      {
        question: 'I am moving out',
        answer:
          'Close your own place from My Flat. Anything you still owe follows you out — it stays on your record and your moderator can still see it.',
        href: '/my-flat',
        cta: 'Open My Flat',
        roles: ['resident'],
      },
      {
        question: 'Closing a building',
        answer:
          'Its flats and residents stop appearing everywhere, and you can move everyone into another building first. Nothing in the ledger is deleted — a receipt has to outlive the building it was issued in.',
        href: '/admin',
        cta: 'Open buildings',
        roles: ['owner'],
      },
    ],
  },
  {
    title: 'Plan and billing',
    icon: CreditCard,
    topics: [
      {
        question: 'I have run out of units or buildings',
        answer:
          'Your plan sets how much room you have. Nothing you already built stops working at the limit — only adding more does.',
        href: '/settings/plans',
        cta: 'See pricing',
        roles: ['owner'],
      },
      {
        question: 'Will I be charged again automatically?',
        answer:
          'No. A plan is bought for a fixed number of months and then stops. No card is kept on file and nothing renews on its own.',
        roles: ['owner'],
      },
      {
        question: 'Where is my invoice?',
        answer:
          'Every confirmed subscription payment has a PDF on the billing page, and the same file was emailed when the payment cleared.',
        href: '/settings/billing',
        cta: 'Billing history',
        roles: ['owner'],
      },
    ],
  },
]

export default async function SupportPage() {
  const session = await requireSession('/support')
  const role = sessionRole(session)

  const audience =
    role === 'admin' || role === 'super_admin'
      ? 'owner'
      : role === 'moderator'
        ? 'moderator'
        : 'resident'

  const sections = SECTIONS.map((section) => ({
    ...section,
    topics: section.topics.filter(
      (topic) => !topic.roles || topic.roles.includes(audience),
    ),
  })).filter((section) => section.topics.length > 0)

  return (
    /*
    No container of its own. The app shell's <main> already centres to 1600px
    and sets the padding, so a wrapper here only narrows the page and pads it
    twice — which is why this screen looked cramped next to Flats and Dues.
  */
    <>
      <PageHeader
        title="Support"
        description="Most things have a rule behind them, and the rule is usually the answer. If it is not, we reply on WhatsApp within the hour on a working day."
      />

      <section className="mt-6 grid gap-3 sm:grid-cols-2">
        <a
          href={whatsappLink('Hello, I need help with my HouseControl account.')}
          target="_blank"
          rel="noreferrer"
          className="flex items-start gap-3 rounded-panel border border-line bg-surface p-5 transition-colors hover:border-ink/25"
        >
          <MessageCircle className="mt-0.5 size-5 shrink-0 text-paid" aria-hidden />

          <span>
            <span className="block font-medium text-ink">WhatsApp</span>
            <span className="mt-1 block text-sm leading-relaxed text-muted">
              Fastest for anything about money, plans, or a building behaving strangely.
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
              For something urgent that cannot wait for a reply.
            </span>
          </span>
        </a>
      </section>

      <div className="mt-10 flex items-center gap-3">
        <h2 className="text-title text-ink">Common questions</h2>
        <Badge tone="neutral">{roleLabels[role]}</Badge>
      </div>

      <p className="mt-1 max-w-[64ch] text-sm leading-relaxed text-muted">
        Only the ones that apply to you. Somebody in another role sees a different list.
      </p>

      <div className="mt-6 space-y-8">
        {sections.map((section) => (
          <section key={section.title}>
            <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
              <section.icon className="size-4" aria-hidden />
              {section.title}
            </h3>

            <ul className="mt-3 space-y-3">
              {section.topics.map((topic) => (
                <li
                  key={topic.question}
                  className="rounded-panel border border-line bg-surface p-5"
                >
                  <p className="text-sm font-medium text-ink">{topic.question}</p>

                  <p className="mt-1.5 max-w-[68ch] text-sm leading-relaxed text-muted">
                    {topic.answer}
                  </p>

                  {topic.href && (
                    <Link
                      href={topic.href}
                      className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline"
                    >
                      {topic.cta ?? 'Open'}
                      <ArrowRight className="size-3.5" aria-hidden />
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {/*
        Placed on Support rather than shouted about on every page. Somebody
        already using the site in a browser is not being held back by the
        browser; this is for the person who has decided they use it often enough
        to want it on their home screen, and that person comes looking.
      */}
      <section className="mt-10 rounded-panel border border-line bg-surface p-5">
        <p className="text-sm font-medium text-ink">Keep it one tap away</p>

        <p className="mt-1 max-w-[64ch] text-sm leading-relaxed text-muted">
          {site.name} installs like an app on a phone, tablet or computer — its own icon,
          no browser bar, and pages you have already opened still work without a
          connection.
        </p>

        <div className="mt-3">
          <InstallApp />
        </div>
      </section>

      <section className="mt-6 flex items-start gap-3 rounded-panel border border-line bg-surface p-5">
        <LifeBuoy className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />

        <div>
          <p className="text-sm font-medium text-ink">Writing to us</p>

          <p className="mt-1 max-w-[64ch] text-sm leading-relaxed text-muted">
            Include the flat number and the month, or the receipt number if it is about a
            payment. Almost every question about money is answered by one of those, and
            asking for them costs a round trip.
          </p>

          <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted">
            <Mail className="size-3.5" aria-hidden />
            Signed in as <span className="text-ink">{session.email}</span>
          </p>
        </div>
      </section>

      <p className="mt-6 text-xs text-muted">
        Looking for the public contact page instead?{' '}
        <Link href="/contact" className="text-primary underline-offset-4 hover:underline">
          {site.name} contact
        </Link>
      </p>
    </>
  )
}
