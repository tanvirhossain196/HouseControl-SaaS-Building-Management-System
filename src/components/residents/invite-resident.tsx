'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, Trash2 } from 'lucide-react'
import { inviteToFlatAction, revokeInviteAction } from '@/app/(app)/flats/actions'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/input'
import { FormError } from '@/components/auth/form-error'
import { useToast } from '@/components/providers/toast-provider'
import { formatTaka } from '@/lib/utils'
import type { PendingShare } from '@/services/flats.service'

/**
 * Invites straight into this flat, so a moderator never has to go through the
 * owner's organization screen — which they cannot open anyway.
 */
export function InviteResident({
  flatId,
  unassigned,
  pendingInvites = [],
  trigger,
}: {
  flatId: string
  unassigned: number
  pendingInvites?: PendingShare[]
  trigger: React.ReactElement
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fields, setFields] = React.useState<Record<string, string[]>>({})
  const [link, setLink] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)
  const formRef = React.useRef<HTMLFormElement>(null)

  function fullInviteLink(token: string) {
    return `${window.location.origin}/invite/${token}`
  }

  async function copyInvite(token: string) {
    await navigator.clipboard.writeText(fullInviteLink(token))
    toast({ tone: 'success', title: 'Invite link copied' })
  }

  async function revokeInvite(inviteId: string) {
    if (pending) return
    setPending(true)
    const result = await revokeInviteAction(flatId, inviteId)
    setPending(false)

    if (!result.ok) {
      toast({ tone: 'error', title: result.error })
      return
    }

    toast({ tone: 'success', title: 'Invite removed' })
    router.refresh()
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const data = Object.fromEntries(new FormData(event.currentTarget))
    setPending(true)
    setError(null)
    setFields({})

    const result = await inviteToFlatAction({ ...data, flatId })
    setPending(false)

    if (!result.ok) {
      setError(result.error)
      setFields(result.fieldErrors ?? {})
      return
    }

    setLink(result.data.link)
    formRef.current?.reset()
    toast({
      tone: 'success',
      title: 'Invite created',
      body: 'Copy the link and send it.',
    })
    router.refresh()
  }

  return (
    <>
      {React.cloneElement(trigger, { onClick: () => setOpen(true) })}

      <Modal
        open={open}
        onClose={() => {
          setOpen(false)
          setLink(null)
        }}
        title="Invite someone into this flat"
        description="They join once they open the link and sign in with this address. The link works once and expires in seven days."
      >
        <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-5 pb-2">
          <FormError message={error} />

          <Field
            label="Their email"
            htmlFor="inviteEmail"
            error={fields.email?.[0]}
            required
          >
            <Input
              id="inviteEmail"
              name="email"
              type="email"
              inputMode="email"
              placeholder="resident@example.com"
              aria-invalid={Boolean(fields.email)}
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Role" htmlFor="inviteRole">
              <Select id="inviteRole" name="role" defaultValue="member">
                <option value="member">Resident</option>
                <option value="moderator">Moderator</option>
              </Select>
            </Field>

            <Field
              label="Rent share"
              htmlFor="inviteShare"
              hint={
                unassigned > 0
                  ? `${formatTaka(unassigned)} unassigned`
                  : 'Shares already add up — lower someone else first.'
              }
              error={fields.rentShare?.[0]}
            >
              <Input
                id="inviteShare"
                name="rentShare"
                inputMode="numeric"
                defaultValue={unassigned > 0 ? unassigned : 0}
                className="tabular font-mono"
              />
            </Field>
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Create invite link
            </Button>
          </div>
        </form>

        {link && (
          <div className="rounded-control border border-paid/30 bg-paid-soft p-4">
            <p className="text-sm font-medium text-ink">Send this link.</p>
            <div className="mt-3 flex gap-2">
              <Input
                readOnly
                value={link}
                className="font-mono text-xs"
                onFocus={(event) => event.target.select()}
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
      </Modal>

      {pendingInvites.length > 0 && (
        <div className="mt-4 rounded-panel border border-line bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-ink">Pending invites</h3>
              <p className="mt-1 text-xs text-muted">
                Copy a member-specific link or remove the invite.
              </p>
            </div>
            <span className="rounded-full bg-surface-subtle px-2 py-1 text-xs text-muted">
              {pendingInvites.length}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {pendingInvites.map((invite) => (
              <div
                key={invite.id ?? invite.email}
                className="rounded-control border border-line p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{invite.email}</p>
                    <p className="mt-1 text-xs text-muted">
                      {invite.role === 'moderator' ? 'Moderator' : 'Resident'} ·{' '}
                      {formatTaka(invite.share)}
                    </p>
                  </div>
                  {invite.id && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove invite for ${invite.email}`}
                      onClick={() => revokeInvite(invite.id!)}
                      disabled={pending}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>

                {invite.token && (
                  <div className="mt-3 flex gap-2">
                    <Input
                      readOnly
                      value={fullInviteLink(invite.token)}
                      className="font-mono text-xs"
                      onFocus={(event) => event.target.select()}
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={`Copy invite link for ${invite.email}`}
                      onClick={() => copyInvite(invite.token!)}
                    >
                      <Copy />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
