'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, RotateCcw, TriangleAlert } from 'lucide-react'

import {
  cancelSubscription,
  resumeSubscription,
} from '@/app/(app)/settings/billing/actions'
import { Button } from '@/components/ui/button'

/**
 * Time remaining, and the two ways out.
 *
 * The dates and day counts are worked out on the server and passed in already
 * formatted. Recomputing them here would put the answer at the mercy of the
 * visitor's device clock and timezone, and a billing page that says a different
 * number of days than the invoice is worse than one that says nothing.
 */

type Mode = 'period_end' | 'immediate'

export function SubscriptionControls({
  planName,
  state,
  daysLeft,
  remaining,
  startedOn,
  endsOn,
}: {
  planName: string
  state: 'free' | 'active' | 'ending' | 'expired' | 'past_due'
  daysLeft: number | null
  remaining: string
  startedOn: string
  endsOn: string
}) {
  const router = useRouter()
  const [choosing, setChoosing] = React.useState(false)
  const [pending, setPending] = React.useState<Mode | 'resume' | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState<string | null>(null)

  const paid = state === 'active' || state === 'ending'

  async function runCancel(mode: Mode) {
    setPending(mode)
    setError(null)

    const result = await cancelSubscription({ mode })

    setPending(null)

    if (!result.ok) {
      setError(result.error)
      return
    }

    setChoosing(false)
    setDone(
      mode === 'period_end'
        ? `Your plan will stay active until ${endsOn}, then move to Free.`
        : 'Your organization is now on the Free plan.',
    )
    router.refresh()
  }

  async function runResume() {
    setPending('resume')
    setError(null)

    const result = await resumeSubscription()

    setPending(null)

    if (!result.ok) {
      setError(result.error)
      return
    }

    setDone('Cancellation undone. Your plan will continue.')
    router.refresh()
  }

  return (
    <div className="mt-6 border-t border-line pt-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-control bg-raised text-muted">
            <CalendarClock className="size-5" aria-hidden />
          </div>

          <div>
            <p className="text-sm font-medium text-ink">{remaining}</p>

            <p className="mt-1 text-xs text-muted">
              {paid
                ? `Started ${startedOn} · ends ${endsOn}`
                : state === 'expired'
                  ? `This plan ran out on ${endsOn}.`
                  : 'The Free plan does not expire.'}
            </p>
          </div>
        </div>

        {paid && daysLeft !== null && (
          <p className="tabular font-mono text-2xl font-semibold text-ink">
            {Math.max(0, daysLeft)}
            <span className="ml-1 text-xs font-normal text-muted">
              day{daysLeft === 1 ? '' : 's'}
            </span>
          </p>
        )}
      </div>

      {state === 'ending' && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-control border border-due/30 bg-due-soft px-4 py-3">
          <p className="text-sm text-ink">
            {planName} ends on {endsOn}. After that your organization moves to
            the Free plan.
          </p>

          <Button
            type="button"
            variant="outline"
            size="sm"
            loading={pending === 'resume'}
            onClick={runResume}
          >
            <RotateCcw aria-hidden />
            Keep my plan
          </Button>
        </div>
      )}

      {done && (
        <p className="mt-4 rounded-control bg-raised px-4 py-3 text-sm text-ink">
          {done}
        </p>
      )}

      {paid && state !== 'ending' && !choosing && (
        <div className="mt-4">
          <Button
            type="button"
            variant="quiet"
            size="sm"
            onClick={() => {
              setChoosing(true)
              setError(null)
            }}
          >
            Cancel plan
          </Button>
        </div>
      )}

      {choosing && (
        <div className="mt-4 rounded-control border border-line bg-raised/50 p-4">
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-due" aria-hidden />

            <div>
              <p className="text-sm font-medium text-ink">
                How would you like to cancel {planName}?
              </p>

              <p className="mt-1 text-xs leading-relaxed text-muted">
                Either way your data stays exactly where it is. The Free plan
                covers one building and twelve units, so anything above that
                becomes read-only until you upgrade again.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-control border border-line bg-surface p-4">
              <p className="text-sm font-medium text-ink">
                At the end of the period
              </p>

              <p className="mt-1 text-xs leading-relaxed text-muted">
                Keep {planName} until {endsOn}, then move to Free. You have
                already paid for this time.
              </p>

              <Button
                type="button"
                variant="outline"
                size="sm"
                block
                className="mt-3"
                loading={pending === 'period_end'}
                onClick={() => runCancel('period_end')}
              >
                Cancel on {endsOn}
              </Button>
            </div>

            <div className="rounded-control border border-line bg-surface p-4">
              <p className="text-sm font-medium text-ink">Right now</p>

              <p className="mt-1 text-xs leading-relaxed text-muted">
                Move to Free immediately. The remaining
                {daysLeft !== null ? ` ${Math.max(0, daysLeft)} ` : ' '}
                day{daysLeft === 1 ? '' : 's'} are forfeited and not refunded.
              </p>

              <Button
                type="button"
                variant="danger"
                size="sm"
                block
                className="mt-3"
                loading={pending === 'immediate'}
                onClick={() => runCancel('immediate')}
              >
                Cancel immediately
              </Button>
            </div>
          </div>

          <button
            type="button"
            className="mt-3 text-xs text-muted underline-offset-4 hover:text-ink hover:underline"
            onClick={() => setChoosing(false)}
          >
            Never mind, keep my plan
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-xs text-overdue">{error}</p>}
    </div>
  )
}