'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Check, X } from 'lucide-react'
import { reviewPaymentAction } from '@/app/(app)/payments/actions'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Field, Textarea } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/layout/page-header'
import { useToast } from '@/components/providers/toast-provider'
import { formatTaka } from '@/lib/utils'
import { FilterChips } from '@/components/ui/filter-chips'
import type { ReviewScopeBuilding } from '@/lib/auth/reviewable'
import { periodLabel } from '@/lib/billing'
import { formatDay } from '@/lib/subscription'
import type { PaymentWithContext } from '@/services/payments.service'

/**
 * What the charge was for.
 *
 * Shown as its own badge rather than folded into the description, because the
 * description is free text a moderator wrote and the category is the thing the
 * ledger actually sorted the money under. A resident paying rent and a resident
 * paying their share of a water bill look identical without it.
 */
const categoryLabel: Record<string, string> = {
  rent: 'Rent',
  utility: 'Utility',
  expense: 'Shared bill',
  penalty: 'Penalty',
  other: 'Other',
}

const methodLabel: Record<string, string> = {
  bkash: 'bKash',
  nagad: 'Nagad',
  bank_transfer: 'Bank transfer',
  cash: 'Cash',
  card: 'Card',
  other: 'Other',
}

/**
 * The moderator's queue. Confirming is one click because it is the common
 * case; rejecting takes a reason because the resident will read it.
 */
export function ReviewQueue({
  payments,
  scope = [],
}: {
  payments: PaymentWithContext[]
  /**
   * Every building and flat this person reviews for, empty ones included.
   *
   * Built from the property tables, not from the queue. A building with nothing
   * pending still belongs on the row: leaving it out reads as "no such
   * building" when the true answer is "nothing waiting here".
   */
  scope?: ReviewScopeBuilding[]
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [rejecting, setRejecting] = React.useState<PaymentWithContext | null>(null)
  const [reason, setReason] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  /**
   * Narrowing the queue, in the order someone actually thinks.
   *
   * Which building, then which flat inside it, then what the money was for.
   * Working down a mixed list of sixty payments and trying to keep track of
   * which building each one belongs to is how the wrong one gets confirmed.
   */
  const [building, setBuilding] = React.useState<string | null>(null)
  const [flat, setFlat] = React.useState<string | null>(null)
  const [category, setCategory] = React.useState<string | null>(null)

  const buildingOptions = React.useMemo(
    () =>
      scope.map((entry) => ({
        value: entry.id,
        label: entry.name,
        count: payments.filter((payment) => payment.buildingId === entry.id).length,
      })),
    [scope, payments],
  )

  /** With one building there is nothing to choose, so it counts as chosen. */
  const only = scope.length === 1 ? (scope[0]?.id ?? null) : null
  const chosen = building ?? only
  const chosenBuilding = scope.find((entry) => entry.id === chosen) ?? null

  const inBuilding = React.useMemo(
    () =>
      chosen === null
        ? payments
        : payments.filter((payment) => payment.buildingId === chosen),
    [payments, chosen],
  )

  const flatOptions = React.useMemo(
    () =>
      (chosenBuilding?.flats ?? []).map((entry) => ({
        value: entry.id,
        label: `Flat ${entry.unitNumber}`,
        count: inBuilding.filter((payment) => payment.flat_id === entry.id).length,
      })),
    [chosenBuilding, inBuilding],
  )

  const inFlat = React.useMemo(
    () =>
      flat === null
        ? inBuilding
        : inBuilding.filter((payment) => payment.flat_id === flat),
    [inBuilding, flat],
  )

  const categoryOptions = React.useMemo(() => {
    const counts = new Map<string, number>()

    for (const payment of inFlat) {
      if (!payment.category) continue
      counts.set(payment.category, (counts.get(payment.category) ?? 0) + 1)
    }

    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({
        value,
        label: categoryLabel[value] ?? value,
        count,
      }))
  }, [inFlat])

  const visible = React.useMemo(
    () =>
      category === null
        ? inFlat
        : inFlat.filter((payment) => payment.category === category),
    [inFlat, category],
  )

  // A flat filter left over from another building would hide everything.
  React.useEffect(() => {
    setFlat(null)
  }, [building])

  const visibleTotal = visible.reduce((sum, payment) => sum + Number(payment.amount), 0)

  async function confirm(payment: PaymentWithContext) {
    setBusyId(payment.id)
    const result = await reviewPaymentAction({
      decision: 'confirm',
      paymentId: payment.id,
    })
    setBusyId(null)

    if (!result.ok) {
      toast({ tone: 'error', title: 'Could not confirm', body: result.error })
      return
    }

    toast({
      tone: 'success',
      title: 'Payment confirmed',
      body: `${formatTaka(Number(payment.amount))} applied. A receipt number was issued.`,
    })
    router.refresh()
  }

  async function reject() {
    if (!rejecting) return
    setBusyId(rejecting.id)
    setError(null)

    const result = await reviewPaymentAction({
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
      tone: 'success',
      title: 'Payment rejected',
      body: 'The resident can submit again.',
    })
    setRejecting(null)
    setReason('')
    router.refresh()
  }

  return (
    <>
      <div className="mb-4 space-y-2">
        <FilterChips
          label="Building"
          allLabel="All buildings"
          value={building}
          onChange={setBuilding}
          options={buildingOptions}
          showEmpty
        />

        {/*
          Flats only after a building is settled. Two buildings can both have a
          2A, and a flat list that mixes them is worse than none — picking one
          would silently include somebody else's.
        */}
        {chosenBuilding !== null &&
          (chosenBuilding.flats.length > 0 ? (
            <FilterChips
              label="Flat"
              allLabel="All flats"
              value={flat}
              onChange={setFlat}
              options={flatOptions}
              showEmpty
            />
          ) : (
            <p className="text-xs text-muted">{chosenBuilding.name} has no flats yet.</p>
          ))}

        <FilterChips
          label="For"
          allLabel="Everything"
          value={category}
          onChange={setCategory}
          options={categoryOptions}
        />
      </div>

      {visible.length !== payments.length && (
        <p className="mb-3 text-xs text-muted">
          Showing {visible.length} of {payments.length} ·{' '}
          <span className="tabular font-mono">{formatTaka(visibleTotal)}</span>
        </p>
      )}

      {visible.length === 0 ? (
        <EmptyState
          title={payments.length === 0 ? 'Nothing to confirm' : 'Nothing here'}
          body={
            payments.length === 0
              ? 'When a resident records a payment, it waits here until you confirm or reject it. Nothing moves on the ledger before that.'
              : 'Nothing is waiting in this part of the queue. Pick another building or flat.'
          }
        />
      ) : (
        <ul className="divide-y divide-line rounded-panel border border-line bg-surface">
          {visible.map((payment) => (
            <li
              key={payment.id}
              className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="tabular font-mono font-semibold text-ink">
                    {formatTaka(Number(payment.amount))}
                  </span>
                  <Badge tone="due" dot>
                    {methodLabel[payment.method] ?? payment.method}
                  </Badge>
                  {payment.category && (
                    <Badge tone="neutral">
                      {categoryLabel[payment.category] ?? payment.category}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted">
                  {payment.payerName ?? 'A resident'}
                  {payment.buildingName ? ` · ${payment.buildingName}` : ''}
                  {payment.unitNumber ? ` · Flat ${payment.unitNumber}` : ''}
                </p>

                <p className="mt-0.5 text-xs text-muted">
                  {payment.period
                    ? `For ${periodLabel(payment.period)}`
                    : 'For this month'}
                  {' · '}
                  {/* The day the resident says the money changed hands, not the
                    day the row was written — those differ often enough to
                    matter when a month is being argued over. */}
                  paid {formatDay(payment.paid_at)}
                  {payment.dueDescription ? ` · ${payment.dueDescription}` : ''}
                </p>
                {payment.reference && (
                  <p className="tabular mt-1 font-mono text-xs text-muted">
                    Ref {payment.reference}
                  </p>
                )}
                {payment.note && (
                  <p className="mt-1 max-w-[60ch] text-xs leading-relaxed text-muted">
                    “{payment.note}”
                  </p>
                )}
              </div>

              <div className="flex shrink-0 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRejecting(payment)}
                  disabled={busyId === payment.id}
                >
                  <X /> Reject
                </Button>
                <Button
                  size="sm"
                  loading={busyId === payment.id}
                  onClick={() => confirm(payment)}
                >
                  {busyId !== payment.id && <Check />} Confirm
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={Boolean(rejecting)}
        onClose={() => {
          setRejecting(null)
          setError(null)
        }}
        title="Reject this payment?"
        description="The resident sees your reason and can submit again. Nothing is deleted."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={busyId === rejecting?.id} onClick={reject}>
              Reject payment
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error && <p className="text-sm text-overdue">{error}</p>}
          <Field label="Reason" htmlFor="rejectReason" required>
            <Textarea
              id="rejectReason"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="No bKash payment with that TrxID arrived on the 3rd."
            />
          </Field>
        </div>
      </Modal>
    </>
  )
}