'use client'

import * as React from 'react'
import { Copy, Check } from 'lucide-react'
import { inviteMember } from './actions'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/input'
import { FormError } from '@/components/auth/form-error'
import { useToast } from '@/components/providers/toast-provider'

const roles = [
  { value: 'member', label: 'Resident — sees only their own dues' },
  { value: 'moderator', label: 'Flat moderator — runs one flat' },
  { value: 'guard', label: 'Guard — the gate register only' },
  { value: 'admin', label: 'Owner — full access to the organization' },
] as const

/**
 * Creates an invite link and sends an email notification to the recipient.
 * The raw link is shown once so an owner can also share it manually via WhatsApp.
 */
export function InviteForm({
  orgId,
  flats,
}: {
  orgId: string
  flats: { id: string; label: string }[]
}) {
  const { toast } = useToast()
  const [role, setRole] = React.useState<string>('member')
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fields, setFields] = React.useState<Record<string, string[]>>({})
  const [link, setLink] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)
  const formRef = React.useRef<HTMLFormElement>(null)

  const needsFlat = role === 'member' || role === 'moderator'

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const formData = new FormData(event.currentTarget)
    const rawData = Object.fromEntries(formData)

    // Clean up empty optional strings so Zod validation passes smoothly
    const payload = {
      ...rawData,
      orgId,
      flatId: rawData.flatId || undefined,
      rentShare: rawData.rentShare ? rawData.rentShare : undefined,
    }

    setPending(true)
    setError(null)
    setFields({})

    const result = await inviteMember(payload)
    setPending(false)

    if (!result.ok) {
      setError(result.error)
      setFields(result.fieldErrors ?? {})
      return
    }

    setLink(result.data.link)
    formRef.current?.reset()
    setRole('member') // Reset state to default

    toast({
      tone: 'success',
      title: 'Invite created & sent',
      body: 'An email has been sent. You can also copy the link manually below.',
    })
  }

  return (
    <div className="space-y-5 rounded-panel border border-line bg-surface p-6">
      <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-5">
        <FormError message={error} />

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Their email" htmlFor="email" error={fields.email?.[0]} required>
            <Input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              placeholder="resident@example.com"
              aria-invalid={Boolean(fields.email)}
            />
          </Field>

          <Field label="Role" htmlFor="role" error={fields.role?.[0]} required>
            <Select
              id="role"
              name="role"
              value={role}
              onChange={(event) => setRole(event.target.value)}
            >
              {roles.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          {needsFlat && (
            <Field
              label="Flat"
              htmlFor="flatId"
              error={fields.flatId?.[0]}
              hint="Which unit this person belongs to."
              required
            >
              <Select id="flatId" name="flatId" defaultValue="">
                <option value="">Select a flat</option>
                {flats.map((flat) => (
                  <option key={flat.id} value={flat.id}>
                    {flat.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {needsFlat && (
            <Field
              label="Rent share"
              htmlFor="rentShare"
              error={fields.rentShare?.[0]}
              hint="Their part of the flat's rent. Shares must add up to the total."
            >
              <Input
                id="rentShare"
                name="rentShare"
                inputMode="numeric"
                placeholder="12000"
              />
            </Field>
          )}
        </div>

        <Button type="submit" loading={pending}>
          Create invite link
        </Button>
      </form>

      {link && (
        <div className="rounded-control border border-paid/30 bg-paid-soft p-4">
          <p className="text-sm font-medium text-ink">
            Invite link generated! It works once, for 7 days.
          </p>
          <div className="mt-3 flex gap-2">
            <Input
              readOnly
              value={link}
              className="font-mono text-xs"
              onFocus={(e) => e.target.select()}
            />
            <Button
              variant="outline"
              size="icon"
              aria-label="Copy invite link"
              onClick={async () => {
                await navigator.clipboard.writeText(link)
                setCopied(true)
                window.setTimeout(() => setCopied(false), 2000)
              }}
            >
              {copied ? <Check /> : <Copy />}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}