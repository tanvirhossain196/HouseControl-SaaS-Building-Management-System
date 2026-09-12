'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Banknote, FileText } from 'lucide-react'

import { submitRemittanceAction } from '@/app/(app)/remittances/actions'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { FormError } from '@/components/auth/form-error'
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

const METHODS = [
  { value: 'bkash', label: 'bKash' },
  { value: 'nagad', label: 'Nagad' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'other', label: 'Other' },
] as const

export type ModeratorRemittance = {
  id: string
  period: string
  amount: number
  amount_paid: number
  due_date: string
  status: 'open' | 'partially_paid' | 'paid' | 'waived'
  flat_count: number
  buildingName: string
  /** Confirmed handovers, each with the receipt the owner's acceptance issued. */
  receipts: Array<{ id: string; amount: number; paidAt: string; receiptNo: string }>
}

/**
 * What the moderator owes the owner, month by month.
 *
 * The amount is the full rent of their flats, not what they managed to collect
 * — so this list is a statement of liability, and the wording avoids implying
 * otherwise. What the residents have actually paid is a separate question,
 * answered on the payments screen.
 */
export function RemittanceList({ rows }: { rows: ModeratorRemittance[] }) {
  const router = useRouter()
  const { toast } = useToast()
  const [paying, setPaying] = React.useState<ModeratorRemittance | null>(null)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const formRef = React.useRef<HTMLFormElement>(null)

  if (rows.length === 0) {
    return (
      <EmptyState
        title="Nothing to hand over"
        body="When the owner bills a month, what you owe them for the flats you cover appears here with the date it is due."
      />
    )
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!paying || pending) return

    const data = Object.fromEntries(new FormData(event.currentTarget)) as Record<
      string,
      string
    >

    setPending(true)
    setError(null)

    const result = await submitRemittanceAction({
      remittanceId: paying.id,
      amount: data.amount,
      method: data.method,
      paidAt: data.paidAt,
      reference: data.reference,
      note: data.note,
    })

    setPending(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    toast({
      tone: 'success',
      title: 'Recorded',
      body: 'The owner will see it in their queue. Nothing settles until they confirm.',
    })

    setPaying(null)
    router.refresh()
  }

  return (
    <>
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

          return (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">
                  {periodLabel(row.period)} · {row.buildingName}
                </p>

                <p className="mt-1 text-xs text-muted">
                  {row.flat_count} flat{row.flat_count === 1 ? '' : 's'} ·{' '}
                  {formatTaka(amount)}
                  {paid > 0 && ` · ${formatTaka(paid)} accepted so far`}
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

                {!settled && (
                  <Button size="sm" onClick={() => setPaying(row)}>
                    <Banknote /> Record handover
                  </Button>
                )}
              </div>

              {row.receipts.length > 0 && (
                <ul className="w-full space-y-1 border-t border-line pt-3">
                  {row.receipts.map((receipt) => (
                    <li
                      key={receipt.id}
                      className="flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <span className="text-muted">
                        {formatTaka(receipt.amount)} accepted on {receipt.paidAt}
                      </span>

                      <a
                        href={`/api/receipts/handover/${receipt.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="tabular inline-flex items-center gap-1.5 font-mono text-primary underline-offset-4 hover:underline"
                      >
                        <FileText className="size-3.5" aria-hidden />
                        {receipt.receiptNo}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>

      <Modal
        open={Boolean(paying)}
        onClose={() => setPaying(null)}
        title={paying ? `Hand over ${periodLabel(paying.period)}` : ''}
        description="This records what you gave the owner. Nothing moves on the ledger until they confirm it."
      >
        {paying && (
          <form ref={formRef} onSubmit={submit} noValidate className="space-y-5">
            <FormError message={error} />

            <Field
              label="Amount"
              htmlFor="amount"
              hint={`${formatTaka(
                Math.round((Number(paying.amount) - Number(paying.amount_paid)) * 100) /
                  100,
              )} still outstanding.`}
              required
            >
              <Input
                id="amount"
                name="amount"
                inputMode="numeric"
                defaultValue={
                  Math.round((Number(paying.amount) - Number(paying.amount_paid)) * 100) /
                  100
                }
                className="tabular font-mono"
              />
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="How" htmlFor="method" required>
                <Select id="method" name="method" defaultValue="cash">
                  {METHODS.map((method) => (
                    <option key={method.value} value={method.value}>
                      {method.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="When" htmlFor="paidAt" required>
                <Input
                  id="paidAt"
                  name="paidAt"
                  type="date"
                  defaultValue={todayInDhaka()}
                />
              </Field>
            </div>

            <Field
              label="Reference"
              htmlFor="reference"
              hint="A bKash TrxID or slip number, if there is one."
            >
              <Input id="reference" name="reference" placeholder="TRX123456" />
            </Field>

            <Field label="Note" htmlFor="note">
              <Textarea id="note" name="note" rows={2} />
            </Field>

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPaying(null)}
                disabled={pending}
              >
                Cancel
              </Button>

              <Button type="submit" loading={pending}>
                Record it
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  )
}
