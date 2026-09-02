import { getResidentOverview } from '@/services/overview.service'
import { daysUntil } from '@/services/dues.service'
import { dueLabel, formatTaka } from '@/lib/utils'
import { PageHeader, EmptyState } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Stat } from './stat'

/**
 * A resident sees one thing: what they owe, and by when. No building totals,
 * no other flats — RLS would refuse those queries anyway.
 */
export async function ResidentDashboard({
  userId,
  name,
}: {
  userId: string
  name: string
}) {
  const stats = await getResidentOverview(userId)
  const days = stats.nextDue ? daysUntil(stats.nextDue.due_date) : null

  return (
    <>
      <PageHeader
        title={`Hello, ${name}.`}
        description="What you owe, and what you have already paid."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat
          label="You owe"
          value={formatTaka(stats.outstanding)}
          tone={
            stats.outstanding > 0
              ? days !== null && days < 0
                ? 'overdue'
                : 'due'
              : 'paid'
          }
          hint={
            stats.nextDue && days !== null
              ? dueLabel(days)
              : 'Nothing outstanding — you are settled up'
          }
        />
        <Stat
          label="Open items"
          value={String(stats.openDues.length)}
          hint="Rent, bills, shares"
        />
        <Stat
          label="Recent payments"
          value={String(stats.recentPayments.length)}
          hint="Last five you sent"
        />
      </div>

      <section className="mt-10">
        <h2 className="text-title text-ink">What you owe</h2>
        <div className="mt-4">
          {stats.openDues.length === 0 ? (
            <EmptyState
              title="Nothing due"
              body="When your moderator bills the month's rent or your share of a bill, it shows up here with the date it is due."
            />
          ) : (
            <ul className="divide-y divide-line rounded-panel border border-line bg-surface">
              {stats.openDues.map((due) => {
                const remaining = Number(due.amount) - Number(due.amount_paid)
                const left = daysUntil(due.due_date)
                return (
                  <li
                    key={due.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5"
                  >
                    <span>
                      <span className="block text-sm text-ink">
                        {due.description ?? `${due.source} · ${due.period.slice(0, 7)}`}
                      </span>
                      <span className="tabular block font-mono text-xs text-muted">
                        {formatTaka(remaining)} of {formatTaka(Number(due.amount))}
                      </span>
                    </span>
                    <Badge
                      tone={left < 0 ? 'overdue' : left <= 3 ? 'due' : 'neutral'}
                      dot
                    >
                      {dueLabel(left)}
                    </Badge>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>
    </>
  )
}
