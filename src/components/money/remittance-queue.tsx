'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Check, X } from 'lucide-react'

import { reviewRemittanceAction } from '@/app/(app)/remittances/actions'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Field, Select, Textarea } from '@/components/ui/input'
import { FormError } from '@/components/auth/form-error'
import { EmptyState } from '@/components/layout/page-header'
import { useToast } from '@/components/providers/toast-provider'
import { formatTaka } from '@/lib/utils'
import { FilterChips } from '@/components/ui/filter-chips'
import { periodLabel } from '@/lib/billing'
import { formatDay } from '@/lib/subscription'

/**
 * The reasons a handover actually gets rejected, in roughly the order they come
 * up.
 *
 * A free-text box asks the owner to compose a sentence at the moment they are
 * annoyed, and what the moderator reads back is usually one unhelpful word.
 * These cover the real cases; anything outside them still gets a box.
 */
const REASONS = [
  'The amount is short',
  'The money never reached me',
  'Wrong month',
  'This was already recorded',
  'The reference does not match',
  'Paid by a different method than recorded',
  'Duplicate entry',
] as const

const OTHER = 'other'

const methodLabel: Record<string, string> = {
  bkash: 'bKash',
  nagad: 'Nagad',
  bank_transfer: 'Bank transfer',
  cash: 'Cash',
  card: 'Card',
  other: 'Other',
}

export type Submission = {
  id: string
  amount: number
  method: string
  paid_at: string
  reference: string | null
  note: string | null
  moderatorName: string
  buildingName: string
  remittance: {
    period: string
    amount: number
    amount_paid: number
    due_date: string
    flat_count: number
  }
}

/**
 * The owner's queue.
 *
 * Confirming is one click because it is the ordinary case. Rejecting asks for a
 * reason, because the moderator reads it and "rejected" on its own tells them
 * nothing about what to fix.
 */
export function RemittanceQueue({ submissions }: { submissions: Submission[] }) {
  const router = useRouter()
  const { toast } = useToast()
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [rejecting, setRejecting] = React.useState<Submission | null>(null)
  const [choice, setChoice] = React.useState<string>(REASONS[0])
  const [detail, setDetail] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  /**
   * One filter here, not three.
   *
   * A handover already names its building and its month, and an owner rarely
   * has enough of them at once to need slicing further. Filters that never get
   * used are noise above the thing people came for.
   */
  const [building, setBuilding] = React.useState<string | null>(null)

  const visible = React.useMemo(
    () =>
      building === null
        ? submissions
        : submissions.filter((row) => row.buildingName === building),
    [submissions, building],
  )

  const buildings = React.useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of submissions) {
      counts.set(row.buildingName, (counts.get(row.buildingName) ?? 0) + 1)
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, label: value, count }))
  }, [submissions])

  // A picked reason stands on its own; "other" is only as good as what is typed.
  const reason = choice === OTHER ? detail.trim() : choice

  if (submissions.length === 0) {
    return (
      <EmptyState
        title="Nothing to confirm"
        body="When a moderator records a handover, it waits here until you accept or reject it. Nothing moves on the ledger before that."
      />
    )
  }

  async function confirm(submission: Submission) {
    setBusyId(submission.id)

    const result = await reviewRemittanceAction({
      decision: 'confirm',
      paymentId: submission.id,
    })

    setBusyId(null)

    if (!result.ok) {
      toast({ tone: 'error', title: 'Could not confirm', body: result.error })
      return
    }

    toast({
      tone: 'success',
      title: 'Handover confirmed',
      body: `${formatTaka(Number(submission.amount))} from ${
        submission.moderatorName
      }. A receipt has been issued to them.`,
    })

    router.refresh()
  }

  async function reject() {
    if (!rejecting) return

    setBusyId(rejecting.id)
    setError(null)

    const result = await reviewRemittanceAction({
      decision: 'reject',
      paymentId: rejecting.id,
      reason,
    })

    setBusyId(null)

    if (!result.ok) {
      setError(result.error)
      return
    }

    toast({
      tone: 'info',
      title: 'Handover rejected',
      body: 'The moderator can see your reason and record it again.',
    })

    setRejecting(null)
    setDetail('')
    router.refresh()
  }

  return (
    <>
      <div className="mb-4">
        <FilterChips
          label="Building"
          allLabel="All buildings"
          value={building}
          onChange={setBuilding}
          options={buildings}
        />
      </div>

      <ul className="divide-y divide-line rounded-panel border border-line bg-surface">
        {visible.map((submission) => (
          <li
            key={submission.id}
            className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">
                {submission.moderatorName} ·{' '}
                <span className="tabular font-mono">
                  {formatTaka(Number(submission.amount))}
                </span>
              </p>

              <p className="mt-1 text-sm text-muted">
                {submission.buildingName} · {submission.remittance.flat_count} flat
                {submission.remittance.flat_count === 1 ? '' : 's'}
              </p>

              <p className="mt-0.5 text-xs text-muted">
                {/*
                  Three dates matter here and they are rarely the same: the
                  month the rent is for, the day the moderator says they handed
                  it over, and the day you asked for it by. A dispute is almost
                  always about the gap between the last two.
                */}
                Rent for {periodLabel(submission.remittance.period)} · handed over{' '}
                {formatDay(submission.paid_at)} · was due{' '}
                {formatDay(submission.remittance.due_date)}
              </p>

              <p className="mt-0.5 text-xs text-muted">
                {methodLabel[submission.method] ?? submission.method}
                {submission.reference && ` · ${submission.reference}`}
              </p>

              {submission.note && (
                <p className="mt-1 text-xs italic text-muted">{submission.note}</p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setRejecting(submission)
                  setChoice(REASONS[0])
                  setDetail('')
                  setError(null)
                }}
                disabled={busyId === submission.id}
              >
                <X /> Reject
              </Button>

              <Button
                size="sm"
                loading={busyId === submission.id}
                onClick={() => confirm(submission)}
              >
                <Check /> Confirm
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <Modal
        open={Boolean(rejecting)}
        onClose={() => setRejecting(null)}
        title="Reject this handover"
        description="The moderator sees the reason and can record it again with the right figures."
      >
        <div className="space-y-5">
          <FormError message={error} />

          <Field label="Why" htmlFor="reason" required>
            <Select
              id="reason"
              value={choice}
              onChange={(event) => setChoice(event.target.value)}
            >
              {REASONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
              <option value={OTHER}>Something else…</option>
            </Select>
          </Field>

          {choice === OTHER && (
            <Field label="Say what happened" htmlFor="detail" required>
              <Textarea
                id="detail"
                rows={3}
                value={detail}
                onChange={(event) => setDetail(event.target.value)}
                placeholder="Only 8,000 arrived, not 12,000."
              />
            </Field>
          )}

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRejecting(null)}
              disabled={Boolean(busyId)}
            >
              Cancel
            </Button>

            <Button
              type="button"
              variant="danger"
              loading={Boolean(busyId)}
              disabled={reason.length < 3}
              onClick={reject}
            >
              Reject it
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}