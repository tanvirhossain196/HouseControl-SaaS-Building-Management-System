'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  MoreHorizontal,
  ShieldCheck,
  ArrowRightLeft,
  UserMinus,
  UserX,
} from 'lucide-react'

import {
  assignModeratorAction,
  transferResidentAction,
  deactivateMemberAction,
  removeResidentAction,
} from '@/app/(app)/flats/actions'

import { formatTaka } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dropdown, DropdownItem, DropdownSeparator } from '@/components/ui/dropdown'
import { Modal } from '@/components/ui/modal'
import { Field, Input, Select } from '@/components/ui/input'
import { FormError } from '@/components/auth/form-error'
import { useToast } from '@/components/providers/toast-provider'
import type { Resident } from '@/services/residents.service'

export type TransferTarget = {
  id: string
  label: string
}

export function ResidentList({
  flatId,
  residents,
  canManage,
  canAssignModerator,
  transferTargets = [],
}: {
  flatId: string
  residents: Resident[]
  canManage: boolean
  canAssignModerator: boolean
  /**
   * Flats this person may move somebody into, already excluding this one.
   *
   * Passed in rather than fetched here, because which flats are available is a
   * permission question and the answer belongs on the server.
   */
  transferTargets?: TransferTarget[]
}) {
  const router = useRouter()
  const { toast } = useToast()

  const [moving, setMoving] = React.useState<Resident | null>(null)
  const [target, setTarget] = React.useState('')

  const [removing, setRemoving] = React.useState<Resident | null>(null)

  const [deactivating, setDeactivating] = React.useState<Resident | null>(null)

  const [reason, setReason] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  function closeDialogs() {
    if (pending) return

    setRemoving(null)
    setDeactivating(null)
    setReason('')
    setError(null)
  }

  async function removeResident() {
    if (!removing) return

    setPending(true)
    setError(null)

    const result = await removeResidentAction({
      flatId,
      memberId: removing.id,
      reason: reason.trim() || undefined,
    })

    setPending(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    toast({
      tone: 'success',
      title: `${removing.fullName} removed from the flat`,
      body:
        residents.length > 1
          ? 'Their rent share was redistributed among the remaining residents.'
          : 'The flat has no active resident now.',
    })

    closeDialogs()
    router.refresh()
  }

  async function move() {
    if (!moving || !target || pending) return

    setPending(true)
    setError(null)

    const result = await transferResidentAction({
      flatId,
      memberId: moving.id,
      targetFlatId: target,
    })

    setPending(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    toast({
      tone: 'success',
      title: `${moving.fullName} moved to flat ${result.data.unitNumber}`,
      body: 'Their unpaid charges stay on this flat. Set their rent share in the new one.',
    })

    setMoving(null)
    router.refresh()
  }

  async function makeModerator(resident: Resident) {
    setPending(true)

    const result = await assignModeratorAction(flatId, resident.id)

    setPending(false)

    if (!result.ok) {
      toast({
        tone: 'error',
        title: 'Could not assign moderator',
        body: result.error,
      })
      return
    }

    toast({
      tone: 'success',
      title: `${resident.fullName} is now the moderator`,
      body: 'Moderator access has been updated successfully.',
    })

    router.refresh()
  }

  async function deactivateResident() {
    if (!deactivating) return

    setPending(true)
    setError(null)

    const result = await deactivateMemberAction({
      flatId,
      memberId: deactivating.id,
    })

    setPending(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    toast({
      tone: 'success',
      title: `${deactivating.fullName} is now inactive`,
      body: 'Their membership history has been preserved.',
    })

    closeDialogs()
    router.refresh()
  }

  return (
    <>
      <div className="overflow-hidden rounded-panel border border-line bg-surface">
        <ul className="divide-y divide-line">
          {residents.map((resident) => {
            const isModerator = resident.role === 'moderator'

            return (
              <li
                key={resident.id}
                className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar name={resident.fullName} />

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-ink">
                        {resident.fullName}
                      </p>

                      {isModerator && <Badge tone="primary">Moderator</Badge>}
                    </div>

                    <p className="mt-1 truncate text-xs text-muted">{resident.email}</p>

                    <p className="mt-1 text-xs text-muted">
                      {resident.phone ? resident.phone : 'Phone not added'}

                      {!resident.phoneVerified && resident.phone && (
                        <span> · phone unverified</span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:flex sm:items-center">
                  <div>
                    <p className="text-xs text-muted">Rent share</p>

                    <p className="mt-1 font-mono font-semibold text-ink">
                      {formatTaka(Number(resident.rentShare))}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-muted">Outstanding</p>

                    <p
                      className={[
                        'mt-1 font-mono font-semibold',
                        resident.outstanding > 0 ? 'text-overdue' : 'text-paid',
                      ].join(' ')}
                    >
                      {resident.outstanding > 0
                        ? formatTaka(Number(resident.outstanding))
                        : '৳0'}
                    </p>
                  </div>
                </div>

                {canManage && (
                  <Dropdown
                    trigger={
                      <Button
                        variant="quiet"
                        size="icon-sm"
                        aria-label={`Actions for ${resident.fullName}`}
                      >
                        <MoreHorizontal />
                      </Button>
                    }
                  >
                    {canAssignModerator && !isModerator && (
                      <>
                        <DropdownItem onClick={() => makeModerator(resident)}>
                          <ShieldCheck className="size-4" />
                          Make moderator
                        </DropdownItem>

                        <DropdownSeparator />
                      </>
                    )}

                    {!isModerator && transferTargets.length > 0 && (
                      <DropdownItem
                        onClick={() => {
                          setError(null)
                          setTarget('')
                          setMoving(resident)
                        }}
                      >
                        <ArrowRightLeft className="size-4" />
                        Move to another flat
                      </DropdownItem>
                    )}

                    {!isModerator && (
                      <DropdownItem
                        onClick={() => {
                          setError(null)
                          setDeactivating(resident)
                        }}
                      >
                        <UserX className="size-4" />
                        Set inactive
                      </DropdownItem>
                    )}

                    {!isModerator && (
                      <DropdownItem
                        className="text-overdue"
                        onClick={() => {
                          setError(null)
                          setReason('')
                          setRemoving(resident)
                        }}
                      >
                        <UserMinus className="size-4" />
                        Remove from flat
                      </DropdownItem>
                    )}
                  </Dropdown>
                )}
              </li>
            )
          })}
        </ul>
      </div>

      <Modal
        open={Boolean(removing)}
        onClose={closeDialogs}
        title={`Remove ${removing?.fullName} from this flat?`}
        description={
          residents.length > 1
            ? 'Their rent share will be redistributed among the residents who remain.'
            : 'This is the last active resident, so the flat may become vacant.'
        }
        footer={
          <>
            <Button variant="ghost" onClick={closeDialogs} disabled={pending}>
              Cancel
            </Button>

            <Button variant="danger" loading={pending} onClick={removeResident}>
              Remove resident
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormError message={error} />

          {removing && removing.outstanding > 0 && (
            <div className="rounded-control border border-due/30 bg-due-soft px-3 py-3 text-sm text-ink">
              <p className="font-medium">
                Outstanding balance: {formatTaka(Number(removing.outstanding))}
              </p>

              <p className="mt-1 text-xs leading-relaxed text-muted">
                Removing this resident will not delete their payment or due history. The
                balance will remain in the audit record.
              </p>
            </div>
          )}

          <Field
            label="Reason"
            htmlFor="remove-reason"
            hint="Optional. This will be saved in the flat history."
          >
            <Input
              id="remove-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Moved to another flat"
              maxLength={200}
              disabled={pending}
            />
          </Field>

          <p className="text-xs leading-relaxed text-muted">
            Financial records are preserved for audit and payment history. The resident
            will no longer remain active in this flat.
          </p>
        </div>
      </Modal>

      <Modal
        open={Boolean(deactivating)}
        onClose={closeDialogs}
        title={`Set ${deactivating?.fullName} inactive?`}
        description="This resident will no longer be counted as an active resident or rent payer, but their history will remain available."
        footer={
          <>
            <Button variant="ghost" onClick={closeDialogs} disabled={pending}>
              Cancel
            </Button>

            <Button variant="danger" loading={pending} onClick={deactivateResident}>
              Set inactive
            </Button>
          </>
        }
      >
        <FormError message={error} />

        <div className="mt-4 rounded-control border border-due/30 bg-due-soft px-3 py-3 text-sm text-ink">
          Their previous rent shares, dues, payments and audit history will remain saved.
        </div>
      </Modal>

      <Modal
        open={Boolean(moving)}
        onClose={() => setMoving(null)}
        title={moving ? `Move ${moving.fullName}` : ''}
        description="They stop being billed here from the next month and start in the new flat."
        footer={
          <>
            <Button variant="ghost" onClick={() => setMoving(null)} disabled={pending}>
              Cancel
            </Button>

            <Button loading={pending} disabled={!target} onClick={move}>
              Move them
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormError message={error} />

          <Field label="Move to" htmlFor="target-flat" required>
            <Select
              id="target-flat"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
            >
              <option value="">Pick a flat…</option>
              {transferTargets.map((flat) => (
                <option key={flat.id} value={flat.id}>
                  {flat.label}
                </option>
              ))}
            </Select>
          </Field>

          <p className="text-xs leading-relaxed text-muted">
            Anything they still owe stays attached to this flat — a move is not a way to
            clear a balance. They arrive as a resident with no rent share, so set that
            once they are in.
          </p>
        </div>
      </Modal>
    </>
  )
}
