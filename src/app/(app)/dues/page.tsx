import { pageMetadata } from '@/lib/seo'
import { requireSession } from '@/lib/auth/session'
import {
  listDuesForUser,
  listOpenDuesForUser,
} from '@/services/dues.service'
import { listPaymentsForUser } from '@/services/payments.service'
import {
  outstandingOf,
  periodOf,
  todayInDhaka,
} from '@/lib/billing'
import { formatTaka } from '@/lib/utils'
import { rentOnlineStatus } from '@/lib/gateway/rent-availability'

import {
  PageHeader,
} from '@/components/layout/page-header'
import { Stat } from '@/components/dashboard/stat'
import { DueList } from '@/components/money/due-list'
import { PaymentHistory } from '@/components/money/payment-history'

export const metadata = pageMetadata({
  title: 'My dues',
  description: 'What you owe and what you have paid.',
  path: '/dues',
  noIndex: true,
})

/**
 * The resident's own ledger.
 *
 * All records are loaded for the signed-in user only.
 * Supabase RLS provides the final access control.
 */
export default async function MyDuesPage() {
  const session = await requireSession('/dues')

  const [open, all, payments] = await Promise.all([
    listOpenDuesForUser(session.userId).catch(() => []),
    listDuesForUser(session.userId).catch(() => []),
    listPaymentsForUser(session.userId).catch(() => []),
  ])

  // Credentials existing is not the same as the gateway being open — see
  // rentOnlineStatus(), which refuses to call a sandbox "available".
  const online = rentOnlineStatus()

  const today = todayInDhaka()
  const currentPeriod = periodOf()

  const outstanding = open.reduce((sum, due) => {
    return (
      sum +
      outstandingOf({
        amount: Number(due.amount),
        amountPaid: Number(due.amount_paid),
        dueDate: due.due_date,
        status: due.status,
      })
    )
  }, 0)

  const overdue = open.filter(
    (due) => due.due_date < today,
  ).length

  const awaiting = payments.filter(
    (payment) => payment.status === 'pending',
  ).length

  const paidThisMonth = all
    .filter((due) => due.period === currentPeriod)
    .reduce(
      (sum, due) => sum + Number(due.amount_paid),
      0,
    )

  return (
    <>
      <PageHeader
        title="My dues"
        description="Everything billed to you and every payment you have recorded."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="You owe"
          value={formatTaka(outstanding)}
          tone={
            outstanding === 0
              ? 'paid'
              : overdue > 0
                ? 'overdue'
                : 'due'
          }
          hint={
            outstanding === 0
              ? 'You are fully settled'
              : 'Outstanding balance'
          }
        />

        <Stat
          label="Overdue"
          value={String(overdue)}
          tone={overdue > 0 ? 'overdue' : 'paid'}
          hint={
            overdue > 0
              ? 'Past their due date'
              : 'Nothing past its date'
          }
        />

        <Stat
          label="Waiting confirmation"
          value={String(awaiting)}
          hint="Payments recorded but not confirmed"
        />

        <Stat
          label="Paid this month"
          value={formatTaka(paidThisMonth)}
          tone="paid"
          hint="Confirmed amount for this month"
        />
      </div>

      <section className="mt-10">
        <h2 className="text-title text-ink">
          Outstanding dues
        </h2>

        <p className="mt-1 max-w-[62ch] text-sm text-muted">
          {online === 'off'
            ? 'Record what you have paid your moderator. The balance clears once they confirm it.'
            : 'Pay online, or record a payment you made another way. The balance clears after the payment is confirmed.'}
        </p>

        <div className="mt-4">
          <DueList
            dues={open}
            online={online}
          />

          {online === 'off' && open.length > 0 && (
            <p className="mt-3 text-xs leading-relaxed text-muted">
              Paying online is not available yet. Pay your moderator directly —
              by bKash, Nagad or cash — and record it here so your ledger stays
              correct. They will confirm it.
            </p>
          )}

          {online === 'test' && open.length > 0 && (
            <p className="mt-3 text-xs leading-relaxed text-due">
              The gateway is in test mode. A payment made here moves no money
              and settles nothing.
            </p>
          )}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-title text-ink">
          Your payment history
        </h2>

        <p className="mt-1 text-sm text-muted">
          Payments submitted from your account.
        </p>

        <div className="mt-4">
          <PaymentHistory payments={payments} />
        </div>
      </section>
    </>
  )
}