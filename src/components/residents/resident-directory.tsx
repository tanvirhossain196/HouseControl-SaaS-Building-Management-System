'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowRightLeft, MoreHorizontal, UserMinus, UserX } from 'lucide-react'
import { useRouter } from 'next/navigation'

import { formatTaka } from '@/lib/utils'
import { useDebouncedValue } from '@/hooks/use-debounced-value'

import {
  deactivateMemberAction,
  removeResidentAction,
  transferResidentAction,
} from '@/app/(app)/flats/actions'

import { useToast } from '@/components/providers/toast-provider'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dropdown, DropdownItem, DropdownSeparator } from '@/components/ui/dropdown'
import { Field, Input, Select } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { EmptyState } from '@/components/layout/page-header'

import type { DirectoryEntry } from '@/services/residents.service'

export type TransferTarget = {
  id: string
  label: string
}

function ResidentActions({
  resident,
  transferTargets,
}: {
  resident: DirectoryEntry
  transferTargets: TransferTarget[]
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [pending, setPending] = React.useState(false)
  const [moving, setMoving] = React.useState(false)
  const [target, setTarget] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  /**
   * A moderator cannot be moved from here.
   *
   * Moving them out of a flat that still has residents would leave nobody able
   * to confirm those residents' payments. The flat page enforces the same rule;
   * this just avoids offering a button that always fails.
   */
  const canMove = resident.role !== 'moderator' && transferTargets.length > 0

  async function move() {
    if (!target || pending) return

    setPending(true)
    setError(null)

    const result = await transferResidentAction({
      flatId: resident.flatId,
      memberId: resident.id,
      targetFlatId: target,
    })

    setPending(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    toast({
      tone: 'success',
      title: `${resident.fullName} moved to flat ${result.data.unitNumber}`,
      body: 'Their unpaid charges stay on the old flat. Set their rent share in the new one.',
    })

    setMoving(false)
    router.refresh()
  }

  async function deactivate() {
    const confirmed = window.confirm(
      `Set ${resident.fullName} inactive? They will keep their history but will no longer be active.`,
    )

    if (!confirmed) return

    setPending(true)

    const result = await deactivateMemberAction({
      flatId: resident.flatId,
      memberId: resident.id,
    })

    setPending(false)

    if (!result.ok) {
      toast({
        tone: 'error',
        title: 'Could not deactivate member',
        body: result.error,
      })
      return
    }

    toast({
      tone: 'success',
      title: `${resident.fullName} is now inactive`,
      body: 'Their history has been preserved.',
    })

    router.refresh()
  }

  async function moveOut() {
    const confirmed = window.confirm(
      `Move ${resident.fullName} out of flat ${resident.unitNumber}? Their payment history will be preserved.`,
    )

    if (!confirmed) return

    setPending(true)

    const result = await removeResidentAction({
      flatId: resident.flatId,
      memberId: resident.id,
      reason: 'Removed by organization owner',
    })

    setPending(false)

    if (!result.ok) {
      toast({
        tone: 'error',
        title: 'Could not remove resident',
        body: result.error,
      })
      return
    }

    toast({
      tone: 'success',
      title: `${resident.fullName} moved out`,
      body: 'Their membership and payment history were preserved.',
    })

    router.refresh()
  }

  const menu = (
    <Dropdown
      trigger={
        <Button
          variant="quiet"
          size="icon-sm"
          disabled={pending}
          aria-label={`Actions for ${resident.fullName}`}
        >
          <MoreHorizontal />
        </Button>
      }
    >
      {canMove && (
        <>
          <DropdownItem
            onClick={() => {
              setError(null)
              setTarget('')
              setMoving(true)
            }}
            disabled={pending}
          >
            <ArrowRightLeft className="size-4" />
            Move to another flat
          </DropdownItem>

          <DropdownSeparator />
        </>
      )}

      <DropdownItem onClick={deactivate} disabled={pending}>
        <UserX className="size-4" />
        Set inactive
      </DropdownItem>

      <DropdownSeparator />

      <DropdownItem onClick={moveOut} disabled={pending} className="text-overdue">
        <UserMinus className="size-4" />
        Move out
      </DropdownItem>
    </Dropdown>
  )

  return (
    <>
      {menu}

      <Modal
        open={moving}
        onClose={() => setMoving(false)}
        title={`Move ${resident.fullName}`}
        description={`They leave flat ${resident.unitNumber} and start in the new one.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setMoving(false)} disabled={pending}>
              Cancel
            </Button>

            <Button loading={pending} disabled={!target} onClick={move}>
              Move them
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error && <p className="text-sm text-overdue">{error}</p>}

          <Field label="Move to" htmlFor={`target-${resident.id}`} required>
            <Select
              id={`target-${resident.id}`}
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
            Anything they still owe stays attached to flat {resident.unitNumber} — a move
            is not a way to clear a balance. They arrive as a resident with no rent share,
            so set that once they are in.
          </p>
        </div>
      </Modal>
    </>
  )
}

export function ResidentDirectory({
  residents,
  transferTargets = [],
}: {
  residents: DirectoryEntry[]
  /** Flats somebody may be moved into — decided on the server. */
  transferTargets?: TransferTarget[]
}) {
  const [search, setSearch] = React.useState('')
  const [role, setRole] = React.useState<'all' | 'moderator' | 'resident'>('all')

  const query = useDebouncedValue(search, 200).trim().toLowerCase()

  const rows = residents.filter((resident) => {
    if (role !== 'all' && resident.role !== role) {
      return false
    }

    if (!query) return true

    return [resident.fullName, resident.email, resident.unitNumber, resident.buildingName]
      .join(' ')
      .toLowerCase()
      .includes(query)
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name, email, unit…"
          aria-label="Search residents"
          className="max-w-xs"
        />

        <Select
          value={role}
          onChange={(event) => setRole(event.target.value as typeof role)}
          aria-label="Filter by role"
          className="max-w-[11rem]"
        >
          <option value="all">All roles</option>
          <option value="moderator">Moderators</option>
          <option value="resident">Residents</option>
        </Select>

        <p className="tabular self-center font-mono text-xs text-muted">
          {rows.length} of {residents.length}
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Nobody matches"
          body="Clear the search to see everyone again."
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <THead>
              <TR>
                <TH>Person</TH>
                <TH>Flat</TH>
                <TH>Role</TH>
                <TH>Rent share</TH>
                <TH>Outstanding</TH>
                <TH className="text-right">Action</TH>
              </TR>
            </THead>

            <TBody>
              {rows.map((resident) => (
                <TR key={resident.id}>
                  <TD>
                    <span className="flex items-center gap-3">
                      <Avatar name={resident.fullName} size="sm" />

                      <span className="min-w-0">
                        <span className="block truncate text-sm text-ink">
                          {resident.fullName}
                        </span>

                        <span className="block truncate text-xs text-muted">
                          {resident.email}
                        </span>
                      </span>
                    </span>
                  </TD>

                  <TD>
                    <Link
                      href={`/flats/${resident.flatId}`}
                      className="tabular font-mono text-xs text-primary hover:underline"
                    >
                      {resident.unitNumber}
                    </Link>

                    <span className="block text-xs text-muted">
                      {resident.buildingName}
                    </span>
                  </TD>

                  <TD>
                    <Badge tone={resident.role === 'moderator' ? 'primary' : 'neutral'}>
                      {resident.role}
                    </Badge>
                  </TD>

                  <TD className="tabular font-mono">{formatTaka(resident.rentShare)}</TD>

                  <TD
                    className={
                      resident.outstanding > 0
                        ? 'tabular font-mono text-overdue'
                        : 'tabular font-mono text-muted'
                    }
                  >
                    {resident.outstanding > 0 ? formatTaka(resident.outstanding) : '—'}
                  </TD>

                  <TD className="text-right">
                    <ResidentActions
                      resident={resident}
                      transferTargets={transferTargets.filter(
                        (flat) => flat.id !== resident.flatId,
                      )}
                    />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  )
}
