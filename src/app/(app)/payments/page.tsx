import Link from 'next/link'

import { pageMetadata } from '@/lib/seo'
import { requireSession } from '@/lib/auth/session'
import { reviewableFlatIds, listReviewScope } from '@/lib/auth/reviewable'
import { sessionCan, sessionRole } from '@/lib/auth/guards'
import { createServerSupabase } from '@/lib/supabase/server'

import {
  listPaymentsForFlats,
  listPaymentsForUser,
  listPendingPayments,
} from '@/services/payments.service'

import { formatTaka } from '@/lib/utils'
import { periodOf, periodLabel } from '@/lib/billing'

import { PageHeader, EmptyState } from '@/components/layout/page-header'
import { Stat } from '@/components/dashboard/stat'
import { Tabs } from '@/components/ui/tabs'
import { ReviewQueue } from '@/components/money/review-queue'
import { PaymentHistory } from '@/components/money/payment-history'
import { buttonVariants } from '@/components/ui/button'

export const metadata = pageMetadata({
  title: 'Payments',
  description: 'View your payments or confirm resident payments.',
  path: '/payments',
  noIndex: true,
})

async function ResidentPaymentsPage({
  userId,
}: {
  userId: string
}) {
  const payments = await listPaymentsForUser(userId).catch(() => [])

  const period = periodOf()

  const confirmedThisMonth = payments.filter(
    (payment) =>
      payment.status === 'confirmed' &&
      payment.paid_at?.startsWith(period.slice(0, 7)),
  )

  const pendingPayments = payments.filter(
    (payment) => payment.status === 'pending',
  )

  const confirmedAmount = confirmedThisMonth.reduce(
    (sum, payment) => sum + Number(payment.amount),
    0,
  )

  const pendingAmount = pendingPayments.reduce(
    (sum, payment) => sum + Number(payment.amount),
    0,
  )

  return (
    <>
      <PageHeader
        title="My payments"
        description="View your payment history and payment confirmation status."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat
          label="Total payments"
          value={String(payments.length)}
          hint="Payments recorded from your account"
        />

        <Stat
          label="Confirmed this month"
          value={formatTaka(confirmedAmount)}
          tone="paid"
          hint={`${confirmedThisMonth.length} confirmed payment${
            confirmedThisMonth.length === 1 ? '' : 's'
          }`}
        />

        <Stat
          label="Waiting for confirmation"
          value={formatTaka(pendingAmount)}
          tone={pendingPayments.length > 0 ? 'due' : 'paid'}
          hint={
            pendingPayments.length > 0
              ? `${pendingPayments.length} payment${
                  pendingPayments.length === 1 ? '' : 's'
                } awaiting review`
              : 'No pending payments'
          }
        />
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/dues"
          className={buttonVariants({
            variant: 'primary',
            size: 'sm',
          })}
        >
          Pay an outstanding due
        </Link>

        <Link
          href="/dashboard"
          className={buttonVariants({
            variant: 'outline',
            size: 'sm',
          })}
        >
          Back to dashboard
        </Link>
      </div>

      <section className="mt-10">
        <h2 className="text-title text-ink">Payment history</h2>

        <p className="mt-1 text-sm text-muted">
          Payments you have submitted and their current confirmation status.
        </p>

        <div className="mt-4">
          {payments.length === 0 ? (
            <EmptyState
              title="No payments yet"
              body="When you pay an outstanding due, your payment will appear here."
              action={
                <Link
                  href="/dues"
                  className={buttonVariants({
                    variant: 'primary',
                    size: 'sm',
                  })}
                >
                  View my dues
                </Link>
              }
            />
          ) : (
            <PaymentHistory payments={payments} />
          )}
        </div>
      </section>
    </>
  )
}

export default async function PaymentsPage() {
  const session = await requireSession('/payments')
  const role = sessionRole(session)

  /*
   * Resident/member sees only their own payment history.
   */
  if (role === 'resident') {
    return <ResidentPaymentsPage userId={session.userId} />
  }

  /*
   * Moderator/admin can review payments submitted by residents.
   */
  if (!sessionCan(session, 'payment.review')) {
    return (
      <>
        <PageHeader
          title="Payments"
          description="View and manage your payment activity."
        />

        <EmptyState
          title="Payments are not available"
          body="You do not have permission to review payments for this account."
        />
      </>
    )
  }

  const flatIds = await reviewableFlatIds(session)
  const scope = await listReviewScope(session).catch(() => [])

  const [pending, history] = await Promise.all([
    listPendingPayments(flatIds).catch(() => []),
    listPaymentsForFlats(flatIds).catch(() => []),
  ])

  const period = periodOf()

  const confirmedThisMonth = history.filter(
    (payment) =>
      payment.status === 'confirmed' &&
      payment.paid_at?.startsWith(period.slice(0, 7)),
  )

  const collected = confirmedThisMonth.reduce(
    (sum, payment) => sum + Number(payment.amount),
    0,
  )

  const waiting = pending.reduce(
    (sum, payment) => sum + Number(payment.amount),
    0,
  )

  return (
    <>
      <PageHeader
        title="Payments"
        description="Review resident payments and update the ledger."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat
          label="Waiting on you"
          value={String(pending.length)}
          tone={pending.length > 0 ? 'due' : 'paid'}
          hint={
            pending.length > 0
              ? `${formatTaka(waiting)} claimed`
              : 'Queue is clear'
          }
        />

        <Stat
          label={`Collected in ${periodLabel(period)}`}
          value={formatTaka(collected)}
          tone="paid"
          hint={`${confirmedThisMonth.length} confirmed payment${
            confirmedThisMonth.length === 1 ? '' : 's'
          }`}
        />

        <Stat
          label="Flats you cover"
          value={String(flatIds.length)}
          hint="Moderator or admin flats"
        />
      </div>

      <div className="mt-10">
        <Tabs
          items={[
            {
              id: 'queue',
              label: `To confirm${pending.length ? ` (${pending.length})` : ''}`,
              content: <ReviewQueue payments={pending} scope={scope} />,
            },
            {
              id: 'history',
              label: 'History',
              content: <PaymentHistory payments={history} showWho />,
            },
          ]}
        />
      </div>
    </>
  )
}