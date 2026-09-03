import { pageMetadata } from '@/lib/seo'
import { requireSession } from '@/lib/auth/session'
import { listDuesForUser, listOpenDuesForUser } from '@/services/dues.service'
import { listPaymentsForUser } from '@/services/payments.service'
import { outstandingOf, periodOf, todayInDhaka } from '@/lib/billing'
import { formatTaka } from '@/lib/utils'
import { PageHeader } from '@/components/layout/page-header'
import { Stat } from '@/components/dashboard/stat'
import { DueList } from '@/components/money/due-list'
import { PaymentHistory } from '@/components/money/payment-history'

export const metadata = pageMetadata({
  title: 'My dues',
  description: 'What you owe and what you have paid.',
  path: '/dues',
  noIndex: true,
})

/** The resident's own ledger. RLS makes sure it is only ever their own. */
export default async function MyDuesPage() {
  const session = await requireSession('/dues')

  const [open, all, payments] = await Promise.all([
    listOpenDuesForUser(session.userId).catch(() => []),
    listDuesForUser(session.userId).catch(() => []),
    listPaymentsForUser(session.userId).catch(() => []),
  ])

  // The gateway button only appears where a gateway is actually configured,
  // so a deployment without one shows the manual path only.
  const onlineEnabled = Boolean(process.env.SSLCOMMERZ_STORE_ID)

  const today = todayInDhaka()
  const period = periodOf()

  const outstanding = open.reduce(
    (sum, due) =>
      sum +
      outstandingOf({
        amount: Number(due.amount),
        amountPaid: Number(due.amount_paid),
        dueDate: due.due_date,
        status: due.status,
      }),
    0,
  )

  const overdue = open.filter((due) => due.due_date < today).length
  const awaiting = payments.filter((payment) => payment.status === 'pending').length
  const paidThisMonth = all
    .filter((due) => due.period === period)
    .reduce((sum, due) => sum + Number(due.amount_paid), 0)

  return (
    <>
      <PageHeader
        title="My dues"
        description="Everything billed to you, and every payment you have recorded."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="You owe"
          value={formatTaka(outstanding)}
          tone={outstanding === 0 ? 'paid' : overdue > 0 ? 'overdue' : 'due'}
        />
        <Stat
          label="Overdue"
          value={String(overdue)}
          tone={overdue > 0 ? 'overdue' : 'paid'}
          hint={overdue > 0 ? 'Past their date' : 'Nothing past its date'}
        />
        <Stat
          label="Waiting on confirmation"
          value={String(awaiting)}
          hint="Recorded by you, not yet confirmed"
        />
        <Stat label="Paid this month" value={formatTaka(paidThisMonth)} tone="paid" />
      </div>

      <section className="mt-10">
        <h2 className="text-title text-ink">Outstanding</h2>
        <p className="mt-1 max-w-[62ch] text-sm text-muted">
          Recording a payment tells your moderator what to look for. The balance clears
          when they confirm it.
        </p>
        <div className="mt-4">
          <DueList dues={open} online={onlineEnabled} />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-title text-ink">Your payments</h2>
        <div className="mt-4">
          <PaymentHistory payments={payments} />
        </div>
      </section>
    </>
  )
}
