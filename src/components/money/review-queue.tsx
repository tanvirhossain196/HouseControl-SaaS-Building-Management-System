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
import type { PaymentWithContext } from '@/services/payments.service'

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
export function ReviewQueue({ payments }: { payments: PaymentWithContext[] }) {
  const router = useRouter()
  const { toast } = useToast()
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [rejecting, setRejecting] = React.useState<PaymentWithContext | null>(null)
  const [reason, setReason] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

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

  if (payments.length === 0) {
    return (
      <EmptyState
        title="Nothing to confirm"
        body="When a resident records a payment, it waits here until you confirm or reject it. Nothing moves on the ledger before that."
      />
    )
  }

  return (
    <>
      <ul className="divide-y divide-line rounded-panel border border-line bg-surface">
        {payments.map((payment) => (
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
                {payment.unitNumber && (
                  <span className="tabular font-mono text-xs text-muted">
                    Flat {payment.unitNumber}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted">
                {payment.payerName ?? 'A resident'} · sent {payment.paid_at}
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
