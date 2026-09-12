'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, Check, X } from 'lucide-react'

import { updateRemittanceDateAction } from '@/app/(app)/remittances/actions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/layout/page-header'
import { useToast } from '@/components/providers/toast-provider'
import { formatTaka, dueLabel, latenessOf, type Lateness } from '@/lib/utils'
/** Late is amber, overdue is red — the grace period is visible, not silent. */
const toneFor = (state: Lateness) =>
  state === 'overdue'
    ? 'overdue'
    : state === 'late' || state === 'due'
      ? 'due'
      : 'neutral'

import { periodLabel, todayInDhaka } from '@/lib/billing'
import { daysUntil } from '@/lib/subscription'

export type ScheduleRow = {
  id: string
  period: string
  amount: number
  amount_paid: number
  due_date: string
  status: 'open' | 'partially_paid' | 'paid' | 'waived'
  flat_count: number
  moderatorName: string
}

/**
 * Who owes the owner for this building, and by when.
 *
 * The deadline is editable here rather than in the billing dialog because the
 * two happen on different schedules: a month is billed once, but a date gets
 * renegotiated. Settled months show no edit control — moving a deadline on
 * money already received records something that never happened.
 */
export function HandoverSchedule({
  rows,
  buildingId,
}: {
  rows: ScheduleRow[]
  buildingId: string
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [editing, setEditing] = React.useState<string | null>(null)
  const [value, setValue] = React.useState('')
  const [pending, setPending] = React.useState(false)

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No handovers scheduled"
        body="Bill a month and each moderator will owe you the rent of the flats they cover, with a date to hand it over by."
      />
    )
  }

  async function save(row: ScheduleRow) {
    if (!value) return

    setPending(true)

    const result = await updateRemittanceDateAction({
      remittanceId: row.id,
      dueDate: value,
      buildingId,
    })

    setPending(false)

    if (!result.ok) {
      toast({ tone: 'error', title: 'Could not change the date', body: result.error })
      return
    }

    toast({
      tone: 'success',
      title: 'Deadline moved',
      body: `${row.moderatorName} now hands over by ${value}.`,
    })

    setEditing(null)
    router.refresh()
  }

  return (
    <ul className="divide-y divide-line rounded-panel border border-line bg-surface">
      {rows.map((row) => {
        const amount = Number(row.amount)
        const paid = Number(row.amount_paid)
        const outstanding = Math.round((amount - paid) * 100) / 100
        const settled = row.status === 'paid' || outstanding <= 0
        const left = daysUntil(row.due_date, todayInDhaka()) ?? 0
        const state = latenessOf({
          dueDate: row.due_date,
          period: row.period,
          today: todayInDhaka(),
        })
        const open = editing === row.id

        return (
          <li key={row.id} className="px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">
                  {row.moderatorName} ·{' '}
                  <span className="tabular font-mono">{formatTaka(amount)}</span>
                </p>

                <p className="mt-1 text-xs text-muted">
                  {periodLabel(row.period)} · {row.flat_count} flat
                  {row.flat_count === 1 ? '' : 's'} · due {row.due_date}
                  {paid > 0 && !settled && ` · ${formatTaka(paid)} received`}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-3">
                <Badge tone={settled ? 'paid' : toneFor(state)} dot>
                  {settled
                    ? 'Settled'
                    : paid > 0
                      ? `${formatTaka(outstanding)} remaining`
                      : dueLabel(left, state)}
                </Badge>

                {!settled && !open && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditing(row.id)
                      setValue(row.due_date)
                    }}
                  >
                    <CalendarClock /> Change date
                  </Button>
                )}
              </div>
            </div>

            {open && (
              <div className="mt-3 flex flex-wrap items-end gap-3 rounded-control border border-line bg-raised/50 p-3">
                <div className="min-w-[10rem] flex-1">
                  <label
                    htmlFor={`due-${row.id}`}
                    className="mb-1.5 block text-xs font-medium text-muted"
                  >
                    Hand over by
                  </label>

                  <Input
                    id={`due-${row.id}`}
                    type="date"
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditing(null)}
                    disabled={pending}
                  >
                    <X /> Cancel
                  </Button>

                  <Button size="sm" loading={pending} onClick={() => save(row)}>
                    <Check /> Save
                  </Button>
                </div>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
