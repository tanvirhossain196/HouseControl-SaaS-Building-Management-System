import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/layout/page-header'
import { PayForm } from './pay-form'
import { PayOnlineButton } from './pay-online-button'
import { formatTaka, dueLabel, latenessOf, type Lateness } from '@/lib/utils'
import { daysUntil } from '@/services/dues.service'
import { outstandingOf, periodLabel, todayInDhaka } from '@/lib/billing'
/** Late is amber, overdue is red — the grace period is visible, not silent. */
const toneFor = (state: Lateness) =>
  state === 'overdue'
    ? 'overdue'
    : state === 'late' || state === 'due'
      ? 'due'
      : 'neutral'

import type { DueRow } from '@/types'

/** Resident-এর নিজের outstanding dues এবং payment actions */
export function DueList({
  dues,
  payable = true,
  online = 'off',
}: {
  dues: DueRow[]
  payable?: boolean
  /**
   * Decided on the server by rentOnlineStatus(). 'off' hides the gateway
   * button and says why, rather than leaving a button that leads to a sandbox.
   */
  online?: 'live' | 'test' | 'off'
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
        const amount = Number(due.amount)
        const amountPaid = Number(due.amount_paid)

        const outstanding = outstandingOf({
          amount,
          amountPaid,
          dueDate: due.due_date,
          status: due.status,
        })

        const left = daysUntil(due.due_date)

        // The month the charge belongs to is what sets the overdue date, so a
        // charge billed late in the month is still overdue on the same day.
        const state = latenessOf({
          dueDate: due.due_date,
          period: due.period,
          today: todayInDhaka(),
        })
        const partlyPaid = amountPaid > 0 && outstanding > 0
        const isPaid = due.status === 'paid' || outstanding <= 0

        const dueDate = new Date(due.due_date).toLocaleDateString('en-BD', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })

        return (
          <li
            key={due.id}
            className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">
                {due.description ?? `${due.source} · ${periodLabel(due.period)}`}
              </p>

              <div className="mt-1 space-y-1 text-xs text-muted">
                <p>
                  Due date: <span className="font-medium">{dueDate}</span>
                </p>

                <p className="tabular font-mono">
                  Paid: {formatTaka(amountPaid)} of {formatTaka(amount)}
                </p>

                {!isPaid && (
                  <p className="tabular font-mono font-medium text-ink">
                    Remaining: {formatTaka(outstanding)}
                  </p>
                )}
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-3">
              <Badge tone={isPaid ? 'paid' : toneFor(state)} dot>
                {isPaid
                  ? 'Paid'
                  : partlyPaid
                    ? `${formatTaka(outstanding)} remaining`
                    : dueLabel(left, state)}
              </Badge>

              {payable && !isPaid && online !== 'off' && (
                <PayOnlineButton
                  flatId={due.flat_id}
                  dueId={due.id}
                  test={online === 'test'}
                />
              )}

              {payable && !isPaid && (
                <PayForm
                  flatId={due.flat_id}
                  dueId={due.id}
                  outstanding={outstanding}
                  label={due.description ?? 'This charge'}
                  trigger={
                    <Button size="sm" variant="outline">
                      Record payment
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
