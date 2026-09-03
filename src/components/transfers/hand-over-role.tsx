'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound, UserCog } from 'lucide-react'
import {
  confirmTransferCodeAction,
  resendCodeAction,
  startTransferAction,
  withdrawTransferAction,
} from '@/app/(app)/flats/transfer-actions'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { FormError } from '@/components/auth/form-error'
import { useToast } from '@/components/providers/toast-provider'
import type { Resident } from '@/services/residents.service'

type Step = 'choose' | 'code' | 'waiting'

/**
 * The outgoing moderator's side of a handover: choose the person, prove it is
 * you with a code, then wait for them to accept.
 *
 * The wording is blunt on purpose. This gives away control of a flat's
 * ledger, and the person doing it should know that before they press.
 */
export function HandOverRole({
  flatId,
  residents,
  pending,
}: {
  flatId: string
  residents: Resident[]
  pending?: { id: string; toName: string | null; codeVerified: boolean } | null
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = React.useState(false)
  const [step, setStep] = React.useState<Step>(
    pending ? (pending.codeVerified ? 'waiting' : 'code') : 'choose',
  )
  const [transferId, setTransferId] = React.useState<string | null>(pending?.id ?? null)
  const [sentTo, setSentTo] = React.useState('your verified number')
  const [pendingAction, setPendingAction] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const candidates = residents.filter((resident) => resident.role !== 'moderator')

  async function start(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pendingAction) return

    const data = Object.fromEntries(new FormData(event.currentTarget)) as Record<
      string,
      string
    >
    setPendingAction(true)
    setError(null)

    const result = await startTransferAction({ ...data, flatId })
    setPendingAction(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    setTransferId(result.data.transferId)
    setSentTo(result.data.sentTo)
    setStep('code')
    toast({
      tone: 'info',
      title: 'Code sent',
      body: `We texted a code to ${result.data.sentTo}.`,
    })
  }

  async function confirmCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!transferId || pendingAction) return

    const code = String(new FormData(event.currentTarget).get('code') ?? '')
    setPendingAction(true)
    setError(null)

    const result = await confirmTransferCodeAction({ transferId, code })
    setPendingAction(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    setStep('waiting')
    toast({
      tone: 'success',
      title: 'Confirmed',
      body: 'They have been asked. The role moves when they accept.',
    })
    router.refresh()
  }

  async function withdraw() {
    if (!transferId) return
    setPendingAction(true)
    const result = await withdrawTransferAction(transferId)
    setPendingAction(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    setOpen(false)
    setStep('choose')
    setTransferId(null)
    toast({ tone: 'success', title: 'Handover withdrawn' })
    router.refresh()
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <UserCog /> {pending ? 'Handover in progress' : 'Hand over the role'}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={
          step === 'choose'
            ? 'Hand the moderator role to someone else'
            : step === 'code'
              ? 'Confirm it is you'
              : 'Waiting for them to accept'
        }
        description={
          step === 'choose'
            ? 'They will be able to bill rent, confirm payments and remove residents in this flat. You keep your own tenancy.'
            : step === 'code'
              ? `We sent a six-digit code to ${sentTo}. It expires in ten minutes.`
              : 'The role moves the moment they accept. Until then nothing has changed, and you can still withdraw.'
        }
      >
        {step === 'choose' && (
          <form onSubmit={start} noValidate className="space-y-5 pb-2">
            <FormError message={error} />

            {candidates.length === 0 ? (
              <p className="rounded-control border border-due/30 bg-due-soft px-4 py-3 text-sm text-ink">
                There is nobody else in this flat to hand the role to. Invite a resident
                first.
              </p>
            ) : (
              <>
                <Field label="Hand it to" htmlFor="toUserId" required>
                  <Select id="toUserId" name="toUserId" defaultValue="">
                    <option value="">Choose a resident</option>
                    {candidates.map((resident) => (
                      <option
                        key={resident.userId}
                        value={resident.userId}
                        disabled={!resident.phoneVerified}
                      >
                        {resident.fullName}
                        {resident.phoneVerified
                          ? ''
                          : ' — needs to verify their phone first'}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Note" htmlFor="note" hint="They see this with the request.">
                  <Textarea
                    id="note"
                    name="note"
                    rows={2}
                    placeholder="I am moving out at the end of the month."
                  />
                </Field>

                <div className="flex justify-end gap-3">
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" loading={pendingAction}>
                    <KeyRound /> Send me a code
                  </Button>
                </div>
              </>
            )}
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={confirmCode} noValidate className="space-y-5 pb-2">
            <FormError message={error} />

            <Field label="Six-digit code" htmlFor="code" required>
              <Input
                id="code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                className="tabular text-center font-mono text-lg tracking-[0.4em]"
              />
            </Field>

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                className="text-sm text-muted hover:text-ink"
                onClick={async () => {
                  if (!transferId) return
                  const result = await resendCodeAction(transferId)
                  if (!result.ok) {
                    setError(result.error)
                    return
                  }
                  setError(null)
                  toast({ tone: 'info', title: 'New code sent' })
                }}
              >
                Send another code
              </button>
              <Button type="submit" loading={pendingAction}>
                Confirm
              </Button>
            </div>
          </form>
        )}

        {step === 'waiting' && (
          <div className="space-y-5 pb-2">
            <FormError message={error} />
            <p className="rounded-control border border-line bg-raised/60 px-4 py-3 text-sm text-ink">
              {pending?.toName ?? 'They'} has been asked. The offer lapses in 48 hours if
              nobody answers.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Close
              </Button>
              <Button variant="danger" loading={pendingAction} onClick={withdraw}>
                Withdraw the offer
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
