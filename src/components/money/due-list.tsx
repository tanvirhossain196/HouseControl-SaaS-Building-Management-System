import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/layout/page-header'
import { PayForm } from './pay-form'
import { PayOnlineButton } from './pay-online-button'
import { formatTaka, dueLabel } from '@/lib/utils'
import { daysUntil } from '@/services/dues.service'
import { outstandingOf, periodLabel } from '@/lib/billing'
import type { DueRow } from '@/types'

/** What one resident owes, with a way to record each payment against it. */
export function DueList({
  dues,
  payable = true,
  online = false,
}: {
  dues: DueRow[]
  payable?: boolean
  /** Show the gateway button. Off unless the deployment has a gateway configured. */
  online?: boolean
}) {
  if (dues.length === 0) {
    return (
      <EmptyState
        title="Nothing outstanding"
        body="When your moderator bills the month's rent or your share of a bill, it appears here with the date it is due."
      />
    )
  }

  return (
    <ul className="divide-y divide-line rounded-panel border border-line bg-surface">
      {dues.map((due) => {
        const outstanding = outstandingOf({
          amount: Number(due.amount),
          amountPaid: Number(due.amount_paid),
          dueDate: due.due_date,
          status: due.status,
        })
        const left = daysUntil(due.due_date)
        const partly = Number(due.amount_paid) > 0 && outstanding > 0

        return (
          <li
            key={due.id}
            className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="text-sm text-ink">
                {due.description ?? `${due.source} · ${periodLabel(due.period)}`}
              </p>
              <p className="tabular mt-1 font-mono text-xs text-muted">
                {formatTaka(outstanding)}
                {partly && ` of ${formatTaka(Number(due.amount))} left`}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <Badge
                tone={
                  due.status === 'paid'
                    ? 'paid'
                    : left < 0
                      ? 'overdue'
                      : left <= 3
                        ? 'due'
                        : 'neutral'
                }
                dot
              >
                {due.status === 'paid' ? 'Paid' : dueLabel(left)}
              </Badge>

              {payable && outstanding > 0 && online && (
                <PayOnlineButton flatId={due.flat_id} dueId={due.id} />
              )}

              {payable && outstanding > 0 && (
                <PayForm
                  flatId={due.flat_id}
                  dueId={due.id}
                  outstanding={outstanding}
                  label={due.description ?? 'This charge'}
                  trigger={
                    <Button size="sm" variant="outline">
                      I have paid this
                    </Button>
                  }
                />
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
