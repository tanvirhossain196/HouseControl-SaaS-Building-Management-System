'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontal, ShieldCheck, UserMinus } from 'lucide-react'
import { assignModeratorAction, removeResidentAction } from '@/app/(app)/flats/actions'
import { formatTaka } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dropdown, DropdownItem, DropdownSeparator } from '@/components/ui/dropdown'
import { Modal } from '@/components/ui/modal'
import { Field, Input } from '@/components/ui/input'
import { FormError } from '@/components/auth/form-error'
import { useToast } from '@/components/providers/toast-provider'
import type { Resident } from '@/services/residents.service'

/**
 * The people in one flat. Removing someone spreads their share of the rent
 * over whoever stays, so the dialog says so before it happens.
 */
export function ResidentList({
  flatId,
  residents,
  canManage,
  canAssignModerator,
}: {
  flatId: string
  residents: Resident[]
  canManage: boolean
  canAssignModerator: boolean
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [removing, setRemoving] = React.useState<Resident | null>(null)
  const [reason, setReason] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function remove() {
    if (!removing) return
    setPending(true)
    setError(null)

    const result = await removeResidentAction({ flatId, memberId: removing.id, reason })
    setPending(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    toast({
      tone: 'success',
      title: `${removing.fullName} moved out`,
      body:
        residents.length > 1
          ? 'Their share of the rent was spread over the others.'
          : 'The flat is now marked vacant.',
    })
    setRemoving(null)
    setReason('')
    router.refresh()
  }

  async function makeModerator(resident: Resident) {
    setPending(true)
    const result = await assignModeratorAction(flatId, resident.id)
    setPending(false)

    if (!result.ok) {
      toast({ tone: 'error', title: 'Could not assign', body: result.error })
      return
    }

    toast({ tone: 'success', title: `${resident.fullName} moderates this flat now` })
    router.refresh()
  }

  return (
    <>
      <ul className="divide-y divide-line rounded-panel border border-line bg-surface">
        {residents.map((resident) => (
          <li key={resident.id} className="flex items-center gap-4 px-4 py-3.5">
            <Avatar name={resident.fullName} />

            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 truncate text-sm font-medium text-ink">
                {resident.fullName}
                {resident.role === 'moderator' && <Badge tone="primary">Moderator</Badge>}
              </p>
              <p className="truncate text-xs text-muted">
                {resident.email}
                {resident.phone ? ` · ${resident.phone}` : ''}
                {!resident.phoneVerified && ' · phone unverified'}
              </p>
            </div>

            <div className="hidden text-right sm:block">
              <p className="tabular font-mono text-sm text-ink">
                {formatTaka(resident.rentShare)}
              </p>
              {resident.outstanding > 0 && (
                <p className="tabular font-mono text-xs text-overdue">
                  {formatTaka(resident.outstanding)} owed
                </p>
              )}
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
                {canAssignModerator && resident.role !== 'moderator' && (
                  <>
                    <DropdownItem onClick={() => makeModerator(resident)}>
                      <ShieldCheck className="size-4" /> Make moderator
                    </DropdownItem>
                    <DropdownSeparator />
                  </>
                )}
                <DropdownItem
                  className="text-overdue"
                  onClick={() => setRemoving(resident)}
                >
                  <UserMinus className="size-4" /> Move out
                </DropdownItem>
              </Dropdown>
            )}
          </li>
        ))}
      </ul>

      <Modal
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title={`Move ${removing?.fullName} out?`}
        description={
          residents.length > 1
            ? 'Their share of the rent will be spread over the residents who stay, in the proportion they already pay.'
            : 'They are the last resident, so the flat will be marked vacant.'
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={pending} onClick={remove}>
              Move out
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormError message={error} />

          {removing && removing.outstanding > 0 && (
            <p className="rounded-control border border-due/30 bg-due-soft px-3 py-2.5 text-sm text-ink">
              {removing.fullName} still owes {formatTaka(removing.outstanding)}. Moving
              them out does not clear it — the balance stays on their record and in the
              audit log.
            </p>
          )}

          <Field
            label="Reason"
            htmlFor="reason"
            hint="Optional. Kept in the flat's history."
          >
            <Input
              id="reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Moved to another city"
            />
          </Field>

          <p className="text-xs leading-relaxed text-muted">
            Their payment history stays attached to them — the record is marked as left,
            never deleted.
          </p>
        </div>
      </Modal>
    </>
  )
}
