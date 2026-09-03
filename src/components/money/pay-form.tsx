'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { submitPaymentAction } from '@/app/(app)/payments/actions'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { FormError } from '@/components/auth/form-error'
import { useToast } from '@/components/providers/toast-provider'
import { formatTaka } from '@/lib/utils'
import { todayInDhaka } from '@/lib/billing'

const METHODS = [
  { value: 'bkash', label: 'bKash' },
  { value: 'nagad', label: 'Nagad' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'other', label: 'Other' },
] as const

/**
 * A resident recording money they have already sent.
 *
 * The wording matters: this does not move money. It tells the moderator what
 * to look for in their bKash statement, and nothing changes on the ledger
 * until they confirm it.
 */
export function PayForm({
  flatId,
  dueId,
  outstanding,
  label,
  trigger,
}: {
  flatId: string
  dueId?: string
  outstanding: number
  label: string
  trigger: React.ReactElement
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fields, setFields] = React.useState<Record<string, string[]>>({})
  const formRef = React.useRef<HTMLFormElement>(null)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const data = Object.fromEntries(new FormData(event.currentTarget))
    setPending(true)
    setError(null)
    setFields({})

    const result = await submitPaymentAction({ ...data, flatId, dueId })
    setPending(false)

    if (!result.ok) {
      setError(result.error)
      setFields(result.fieldErrors ?? {})
      return
    }

    setOpen(false)
    formRef.current?.reset()
    toast({
      tone: 'success',
      title: 'Sent for confirmation',
      body: 'Your moderator sees it now. The balance updates once they confirm.',
    })
    router.refresh()
  }

  return (
    <>
      {React.cloneElement(trigger, { onClick: () => setOpen(true) })}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Record a payment"
        description={`${label} — ${formatTaka(outstanding)} outstanding. This tells your moderator what to look for; the balance clears when they confirm it.`}
      >
        <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-5 pb-2">
          <FormError message={error} />

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Amount sent"
              htmlFor="amount"
              error={fields.amount?.[0]}
              required
            >
              <Input
                id="amount"
                name="amount"
                inputMode="numeric"
                defaultValue={outstanding}
                className="tabular font-mono"
                aria-invalid={Boolean(fields.amount)}
              />
            </Field>

            <Field label="How" htmlFor="method">
              <Select id="method" name="method" defaultValue="bkash">
                {METHODS.map((method) => (
                  <option key={method.value} value={method.value}>
                    {method.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Date sent" htmlFor="paidAt" error={fields.paidAt?.[0]}>
              <Input
                id="paidAt"
                name="paidAt"
                type="date"
                defaultValue={todayInDhaka()}
                className="tabular font-mono"
              />
            </Field>

            <Field
              label="Reference"
              htmlFor="reference"
              hint="The bKash TrxID or bank reference."
              error={fields.reference?.[0]}
            >
              <Input id="reference" name="reference" placeholder="8N7A2C4D1E" />
            </Field>
          </div>

          <Field label="Note" htmlFor="note" error={fields.note?.[0]}>
            <Textarea
              id="note"
              name="note"
              rows={2}
              placeholder="Sent from my brother's number, paying half now."
            />
          </Field>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Send for confirmation
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
