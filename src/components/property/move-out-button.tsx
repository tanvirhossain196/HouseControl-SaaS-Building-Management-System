'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { LogOut, TriangleAlert } from 'lucide-react'

import { leaveFlatAction } from '@/app/(app)/flats/actions'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Field, Select, Textarea } from '@/components/ui/input'
import { FormError } from '@/components/auth/form-error'
import { useToast } from '@/components/providers/toast-provider'
import { formatTaka } from '@/lib/utils'

const REASONS = [
  'Moving to another place',
  'Lease finished',
  'Moving city',
  'Rent is too high',
  'Problem with the building',
] as const

const OTHER = 'other'

/**
 * Leaving a flat, done by the person leaving.
 *
 * Two things are said plainly before the button, because both are usually
 * assumed wrongly: an unpaid balance follows you out, and coming back needs a
 * fresh invite. Neither is a punishment — dues are attached to a person, not to
 * a tenancy — but somebody who finds that out afterwards will feel tricked.
 */
export function MoveOutButton({
  flatId,
  unitNumber,
  outstanding,
  isModerator,
  othersRemain,
}: {
  flatId: string
  unitNumber: string
  outstanding: number
  isModerator: boolean
  othersRemain: boolean
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [choice, setChoice] = React.useState<string>(REASONS[0])
  const [detail, setDetail] = React.useState('')

  const reason = choice === OTHER ? detail.trim() : choice
  const blocked = isModerator && othersRemain

  async function leave() {
    if (pending) return

    setPending(true)
    setError(null)

    const result = await leaveFlatAction({ flatId, reason })

    setPending(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    toast({
      tone: 'info',
      title: `You have moved out of flat ${unitNumber}`,
      body:
        result.data.outstanding > 0
          ? `${formatTaka(result.data.outstanding)} is still outstanding and stays on your record.`
          : 'Your place in this flat has been closed.',
    })

    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <Button variant="quiet" size="sm" onClick={() => setOpen(true)}>
        <LogOut /> Move out
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Move out of flat ${unitNumber}`}
        description="Your place in this flat closes and you stop being billed from the next month."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Stay
            </Button>

            <Button
              variant="danger"
              loading={pending}
              disabled={blocked || reason.length < 3}
              onClick={leave}
            >
              Move out
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormError message={error} />

          {blocked ? (
            <div className="flex items-start gap-3 rounded-control border border-due/30 bg-due-soft p-4">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-due" aria-hidden />

              <p className="text-sm leading-relaxed text-ink">
                You run this flat. Hand the moderator role to another resident first —
                somebody has to be able to confirm their payments after you go.
              </p>
            </div>
          ) : (
            <>
              {outstanding > 0 && (
                <div className="flex items-start gap-3 rounded-control border border-overdue/30 bg-overdue/10 p-4">
                  <TriangleAlert
                    className="mt-0.5 size-4 shrink-0 text-overdue"
                    aria-hidden
                  />

                  <p className="text-sm leading-relaxed text-ink">
                    You owe {formatTaka(outstanding)}. Moving out does not clear it — the
                    charge stays on your record and your moderator can still see it.
                  </p>
                </div>
              )}

              <Field label="Why are you leaving?" htmlFor="reason" required>
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
                    rows={2}
                    value={detail}
                    onChange={(event) => setDetail(event.target.value)}
                  />
                </Field>
              )}

              <p className="text-xs leading-relaxed text-muted">
                To come back to this flat later you will need a fresh invite from the
                moderator.
              </p>
            </>
          )}
        </div>
      </Modal>
    </>
  )
}
