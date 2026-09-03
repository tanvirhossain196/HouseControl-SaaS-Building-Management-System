'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { MessageSquare, Wrench } from 'lucide-react'
import {
  addNoteAction,
  changeStatusAction,
  withdrawRequestAction,
} from '@/app/(app)/maintenance/actions'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { FormError } from '@/components/auth/form-error'
import { useToast } from '@/components/providers/toast-provider'
import { formatTaka } from '@/lib/utils'
import {
  allowedTransitions,
  STATUS_LABELS,
  type MaintenanceStatus,
} from '@/lib/maintenance'
import type {
  MaintenanceWithContext,
  TimelineEntry,
} from '@/services/maintenance.service'

/**
 * The thread, and the buttons that move a request along.
 *
 * Which buttons appear comes from the state machine, so an impossible
 * transition is never offered rather than being offered and then refused.
 */
export function RequestDetail({
  request,
  timeline,
  assignees,
  canManage,
  isReporter,
}: {
  request: MaintenanceWithContext
  timeline: TimelineEntry[]
  assignees: { userId: string; fullName: string }[]
  canManage: boolean
  isReporter: boolean
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [note, setNote] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const [resolving, setResolving] = React.useState(false)
  const [withdrawing, setWithdrawing] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const status = request.status as MaintenanceStatus
  const next = allowedTransitions(status)
  const open = status !== 'resolved' && status !== 'cancelled'

  async function postNote() {
    if (!note.trim() || pending) return
    setPending(true)
    const result = await addNoteAction({ requestId: request.id, note })
    setPending(false)

    if (!result.ok) {
      toast({ tone: 'error', title: 'Could not add that', body: result.error })
      return
    }

    setNote('')
    router.refresh()
  }

  async function move(to: MaintenanceStatus, extra: Record<string, unknown> = {}) {
    setPending(true)
    setError(null)

    const result = await changeStatusAction({
      requestId: request.id,
      status: to,
      ...extra,
    })
    setPending(false)

    if (!result.ok) {
      setError(result.error)
      if (!resolving)
        toast({ tone: 'error', title: 'Could not update', body: result.error })
      return
    }

    setResolving(false)
    toast({ tone: 'success', title: `Marked ${STATUS_LABELS[to].toLowerCase()}` })
    router.refresh()
  }

  return (
    <>
      {canManage && open && (
        <div className="flex flex-wrap gap-2 rounded-panel border border-line bg-surface p-4">
          {next.includes('in_progress') && (
            <Button size="sm" loading={pending} onClick={() => move('in_progress')}>
              <Wrench /> Start work
            </Button>
          )}
          {next.includes('resolved') && (
            <Button size="sm" variant="outline" onClick={() => setResolving(true)}>
              Mark resolved
            </Button>
          )}
          {assignees.length > 0 && (
            <Select
              aria-label="Assign to"
              className="h-8 max-w-[14rem] text-[0.8125rem]"
              defaultValue={request.assigned_to ?? ''}
              onChange={(event) => move(status, { assignTo: event.target.value })}
            >
              <option value="">Nobody assigned</option>
              {assignees.map((person) => (
                <option key={person.userId} value={person.userId}>
                  {person.fullName}
                </option>
              ))}
            </Select>
          )}
        </div>
      )}

      {status === 'resolved' && canManage && (
        <div className="rounded-panel border border-line bg-surface p-4">
          <Button
            size="sm"
            variant="outline"
            loading={pending}
            onClick={() => move('open')}
          >
            It has come back — reopen
          </Button>
        </div>
      )}

      {isReporter && open && (
        <div className="mt-3">
          <button
            type="button"
            className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
            onClick={() => setWithdrawing(true)}
          >
            Withdraw this report
          </button>
        </div>
      )}

      <section className="mt-8">
        <h2 className="text-title text-ink">What has happened</h2>

        <ol className="mt-4 space-y-4 border-l border-line pl-5">
          {timeline.map((entry) => (
            <li key={entry.id} className="relative">
              <span
                aria-hidden
                className="absolute -left-[1.4rem] top-1.5 size-2 rounded-full bg-line ring-4 ring-paper"
              />
              <p className="text-sm text-ink">
                {entry.kind === 'note' ? (
                  entry.note
                ) : (
                  <>
                    {entry.fromStatus
                      ? `Moved from ${STATUS_LABELS[entry.fromStatus].toLowerCase()} to ${STATUS_LABELS[entry.toStatus ?? 'open'].toLowerCase()}`
                      : 'Reported'}
                  </>
                )}
              </p>
              <p className="tabular mt-0.5 font-mono text-xs text-muted">
                {entry.actorName ?? 'Someone'} ·{' '}
                {entry.createdAt.slice(0, 16).replace('T', ' ')}
              </p>
            </li>
          ))}
        </ol>

        <div className="mt-6 space-y-3">
          <Field label="Add a note" htmlFor="note">
            <Textarea
              id="note"
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="The plumber is coming Thursday morning."
            />
          </Field>
          <Button size="sm" variant="outline" loading={pending} onClick={postNote}>
            <MessageSquare /> Post
          </Button>
        </div>
      </section>

      <Modal
        open={resolving}
        onClose={() => setResolving(false)}
        title="Mark it resolved"
        description="Say what was done. If it cost money, recording the amount adds it to the building's expenses for this month."
      >
        <form
          onSubmit={(event) => {
            event.preventDefault()
            const data = Object.fromEntries(new FormData(event.currentTarget)) as Record<
              string,
              string
            >
            void move('resolved', {
              resolution: data.resolution,
              cost: data.cost || undefined,
            })
          }}
          className="space-y-5 pb-2"
        >
          <FormError message={error} />

          <Field label="What was done" htmlFor="resolution" required>
            <Textarea
              id="resolution"
              name="resolution"
              rows={3}
              placeholder="Replaced the washer and the tap seat. No leak since Tuesday."
            />
          </Field>

          <Field
            label="What it cost"
            htmlFor="cost"
            hint="Leave blank if nothing was spent. Otherwise it becomes a building expense."
          >
            <Input
              id="cost"
              name="cost"
              inputMode="numeric"
              className="tabular font-mono"
            />
          </Field>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setResolving(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Mark resolved
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={withdrawing}
        onClose={() => setWithdrawing(false)}
        title="Withdraw this report?"
        description="It closes and stays on the record, with your reason. You cannot reopen a withdrawn report — report it again if it comes back."
      >
        <form
          onSubmit={async (event) => {
            event.preventDefault()
            const reason = String(new FormData(event.currentTarget).get('reason') ?? '')
            setPending(true)
            const result = await withdrawRequestAction({ requestId: request.id, reason })
            setPending(false)

            if (!result.ok) {
              setError(result.error)
              return
            }

            setWithdrawing(false)
            toast({ tone: 'success', title: 'Withdrawn' })
            router.refresh()
          }}
          className="space-y-5 pb-2"
        >
          <FormError message={error} />
          <Field label="Why" htmlFor="reason" required>
            <Input
              id="reason"
              name="reason"
              placeholder="Fixed itself / I sorted it myself"
            />
          </Field>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setWithdrawing(false)}>
              Keep it open
            </Button>
            <Button type="submit" variant="danger" loading={pending}>
              Withdraw
            </Button>
          </div>
        </form>
      </Modal>

      {request.cost !== null && request.cost > 0 && (
        <p className="mt-8 text-sm text-muted">
          Recorded cost:{' '}
          <span className="tabular font-mono text-ink">{formatTaka(request.cost)}</span>
          {request.expense_id && (
            <Badge tone="neutral" className="ml-2">
              added to expenses
            </Badge>
          )}
        </p>
      )}
    </>
  )
}
