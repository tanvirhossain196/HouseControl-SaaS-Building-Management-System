'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, UserPlus, X } from 'lucide-react'
import { cancelPreApprovalAction, preApproveAction } from '@/app/(app)/gate/actions'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { FormError } from '@/components/auth/form-error'
import { EmptyState } from '@/components/layout/page-header'
import { useToast } from '@/components/providers/toast-provider'
import { formatEntryCode, KIND_LABELS } from '@/lib/gate'
import type { VisitorWithContext } from '@/services/visitors.service'

/**
 * A resident telling the gate to expect someone.
 *
 * The code is the point: the guard types it in and the visitor walks through
 * without a phone call upstairs. It is shown once here and stays visible on
 * the pending list, because people forward it on WhatsApp.
 */
export function PreApprove({
  flats,
  expected,
}: {
  flats: { id: string; label: string }[]
  expected: VisitorWithContext[]
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fields, setFields] = React.useState<Record<string, string[]>>({})
  const [issued, setIssued] = React.useState<{ code: string; name: string } | null>(null)
  const [copied, setCopied] = React.useState(false)
  const formRef = React.useRef<HTMLFormElement>(null)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const data = Object.fromEntries(new FormData(event.currentTarget)) as Record<
      string,
      string
    >
    setPending(true)
    setError(null)
    setFields({})

    const result = await preApproveAction(data)
    setPending(false)

    if (!result.ok) {
      setError(result.error)
      setFields(result.fieldErrors ?? {})
      return
    }

    setIssued({ code: result.data.code, name: data.fullName ?? 'Your guest' })
    formRef.current?.reset()
    toast({ tone: 'success', title: 'The gate is expecting them' })
    router.refresh()
  }

  async function cancel(visitorId: string) {
    const result = await cancelPreApprovalAction(visitorId)
    if (!result.ok) {
      toast({ tone: 'error', title: 'Could not cancel', body: result.error })
      return
    }
    toast({ tone: 'success', title: 'Pre-approval cancelled' })
    router.refresh()
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-title text-ink">Expected today</h2>
        <Button onClick={() => setOpen(true)}>
          <UserPlus /> Pre-approve a guest
        </Button>
      </div>

      <div className="mt-4">
        {expected.length === 0 ? (
          <EmptyState
            title="Nobody expected"
            body="Pre-approve a guest and they get a code. The guard types it in and lets them up without calling you."
          />
        ) : (
          <ul className="divide-y divide-line rounded-panel border border-line bg-surface">
            {expected.map((visitor) => (
              <li key={visitor.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">{visitor.full_name}</p>
                  <p className="mt-0.5 text-sm text-muted">
                    {KIND_LABELS[visitor.kind]}
                    {visitor.purpose ? ` · ${visitor.purpose}` : ''}
                  </p>
                </div>
                <span className="tabular rounded-tile border border-line bg-raised px-3 py-1.5 font-mono text-sm font-medium text-ink">
                  {visitor.entry_code ? formatEntryCode(visitor.entry_code) : '—'}
                </span>
                <Button
                  variant="quiet"
                  size="icon-sm"
                  aria-label={`Cancel pre-approval for ${visitor.full_name}`}
                  onClick={() => cancel(visitor.id)}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false)
          setIssued(null)
        }}
        title="Pre-approve a guest"
        description="They get a code for the gate. It works once and expires in 12 hours."
      >
        <form ref={formRef} onSubmit={submit} noValidate className="space-y-5 pb-2">
          <FormError message={error} />

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Their name"
              htmlFor="fullName"
              error={fields.fullName?.[0]}
              required
            >
              <Input id="fullName" name="fullName" placeholder="Rumana, my sister" />
            </Field>

            <Field label="Their number" htmlFor="phone" error={fields.phone?.[0]}>
              <Input id="phone" name="phone" inputMode="tel" placeholder="01712345678" />
            </Field>

            <Field label="Which flat" htmlFor="flatId" required>
              <Select id="flatId" name="flatId" defaultValue={flats[0]?.id ?? ''}>
                {flats.map((flat) => (
                  <option key={flat.id} value={flat.id}>
                    {flat.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Kind of visit" htmlFor="kind">
              <Select id="kind" name="kind" defaultValue="guest">
                <option value="guest">Guest</option>
                <option value="service">Service — plumber, electrician</option>
                <option value="courier">Courier</option>
                <option value="other">Other</option>
              </Select>
            </Field>
          </div>

          <Field label="Purpose" htmlFor="purpose" error={fields.purpose?.[0]}>
            <Input id="purpose" name="purpose" placeholder="Staying the weekend" />
          </Field>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Create the code
            </Button>
          </div>
        </form>

        {issued && (
          <div className="rounded-control border border-paid/30 bg-paid-soft p-4">
            <p className="text-sm font-medium text-ink">
              Send this to {issued.name}. The guard will ask for it.
            </p>
            <div className="mt-3 flex items-center gap-3">
              <span className="tabular flex-1 rounded-control border border-line bg-surface px-4 py-3 text-center font-mono text-xl font-semibold tracking-[0.2em] text-ink">
                {formatEntryCode(issued.code)}
              </span>
              <Button
                variant="outline"
                size="icon"
                aria-label="Copy the code"
                onClick={async () => {
                  await navigator.clipboard.writeText(formatEntryCode(issued.code))
                  setCopied(true)
                  window.setTimeout(() => setCopied(false), 2000)
                }}
              >
                {copied ? <Check /> : <Copy />}
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted">
              <Badge tone="neutral">Expires in 12 hours</Badge>
            </p>
          </div>
        )}
      </Modal>
    </>
  )
}
