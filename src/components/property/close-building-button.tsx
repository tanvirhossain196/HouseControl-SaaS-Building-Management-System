'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Archive, MoreHorizontal, TriangleAlert } from 'lucide-react'

import {
  archiveBuildingAction,
  moveBuildingResidentsAction,
  previewBuildingArchiveAction,
} from '@/app/(app)/admin/actions'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/input'
import { FormError } from '@/components/auth/form-error'
import { useToast } from '@/components/providers/toast-provider'
import { formatTaka } from '@/lib/utils'

type Summary = { flats: number; memberships: number; outstanding: number }

/**
 * Closing a building.
 *
 * Two safeguards, and both are there because this is not undoable from the
 * interface. The dialog counts what it will touch before asking, and the name
 * has to be typed — not to be tedious, but because the wrong building in a list
 * of similar names is a click away and the right one is not obviously
 * different.
 *
 * The word is "close", not "delete". Rent that was billed, paid and receipted
 * stays in the ledger; a landlord shutting a building is not a reason to
 * destroy a resident's proof that they paid.
 */
export type MoveTarget = { id: string; name: string }

export function CloseBuildingButton({
  buildingId,
  buildingName,
  moveTargets = [],
  compact = false,
}: {
  buildingId: string
  buildingName: string
  /** Other buildings this person could move the residents into. */
  moveTargets?: MoveTarget[]
  /**
   * An icon-only trigger for tight places, like the corner of a card.
   *
   * Same dialog either way — only the way in changes.
   */
  compact?: boolean
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = React.useState(false)
  const [summary, setSummary] = React.useState<Summary | null>(null)
  const [typed, setTyped] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [moveTo, setMoveTo] = React.useState('')
  const [moving, setMoving] = React.useState(false)
  const [unplaced, setUnplaced] = React.useState<string[]>([])

  /**
   * Moving people out is offered before closing, not folded into it.
   *
   * Closing marks everybody as having left, which is right when a building is
   * actually being shut — but a landlord consolidating two blocks wants the
   * residents to carry on somewhere, and losing them to a "left" status they
   * then have to re-invite from is a bad afternoon.
   */
  async function moveEveryone() {
    if (!moveTo || moving) return

    setMoving(true)
    setError(null)
    setUnplaced([])

    const result = await moveBuildingResidentsAction(buildingId, moveTo)

    setMoving(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    setUnplaced(result.data.unplaced)

    toast({
      tone: result.data.unplaced.length > 0 ? 'info' : 'success',
      title: `${result.data.moved} moved`,
      body:
        result.data.unplaced.length > 0
          ? 'Some could not be placed — there were not enough vacant flats.'
          : 'Everyone has a flat in the new building.',
    })

    // The counts on screen are now wrong; read them again.
    const refreshed = await previewBuildingArchiveAction(buildingId)
    if (refreshed.ok) setSummary(refreshed.data)

    router.refresh()
  }

  const matches = typed.trim() === buildingName.trim()

  async function openDialog() {
    setOpen(true)
    setTyped('')
    setError(null)
    setSummary(null)

    const result = await previewBuildingArchiveAction(buildingId)

    if (result.ok) {
      setSummary(result.data)
    } else {
      setError(result.error)
    }
  }

  async function close() {
    if (!matches || pending) return

    setPending(true)
    setError(null)

    const result = await archiveBuildingAction(buildingId)

    setPending(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    toast({
      tone: 'info',
      title: `${buildingName} is closed`,
      body: `${result.data.flats} flat${
        result.data.flats === 1 ? '' : 's'
      } and ${result.data.memberships} resident${
        result.data.memberships === 1 ? '' : 's'
      } were moved out. The ledger is untouched.`,
    })

    setOpen(false)
    router.push('/admin')
    router.refresh()
  }

  return (
    <>
      {compact ? (
        <Button
          variant="quiet"
          size="icon-sm"
          onClick={openDialog}
          aria-label={`Close ${buildingName}`}
          title={`Close ${buildingName}`}
        >
          <MoreHorizontal />
        </Button>
      ) : (
        <Button variant="quiet" size="sm" onClick={openDialog}>
          <Archive /> Close building
        </Button>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Close ${buildingName}`}
        description="The building, its flats and its residents stop appearing. Nothing in the ledger is deleted."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Keep it
            </Button>

            <Button
              variant="danger"
              loading={pending}
              disabled={!matches}
              onClick={close}
            >
              Close building
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormError message={error} />

          {summary === null ? (
            <p className="text-sm text-muted">Checking what this affects…</p>
          ) : (
            <>
              <dl className="divide-y divide-line rounded-control border border-line">
                <Row label="Flats closed" value={String(summary.flats)} />
                <Row label="Residents moved out" value={String(summary.memberships)} />
                <Row
                  label="Unpaid rent still owed"
                  value={formatTaka(summary.outstanding)}
                />
              </dl>

              {summary.outstanding > 0 && (
                <div className="flex items-start gap-3 rounded-control border border-overdue/30 bg-overdue/10 p-4">
                  <TriangleAlert
                    className="mt-0.5 size-4 shrink-0 text-overdue"
                    aria-hidden
                  />

                  <p className="text-sm leading-relaxed text-ink">
                    {formatTaka(summary.outstanding)} is still owed here. Closing the
                    building does not collect it and does not write it off — the charges
                    stay on the ledger, but you lose the screens you would chase them
                    from.
                  </p>
                </div>
              )}

              {summary.memberships > 0 && moveTargets.length > 0 && (
                <div className="space-y-2 rounded-control border border-line bg-raised/50 p-4">
                  <p className="text-sm font-medium text-ink">
                    Move them somewhere first?
                  </p>

                  <p className="text-xs leading-relaxed text-muted">
                    Each resident takes the next vacant flat in the building you pick, in
                    floor order. Anyone who does not fit is named, and nothing else
                    changes.
                  </p>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <Select
                      value={moveTo}
                      onChange={(event) => setMoveTo(event.target.value)}
                      aria-label="Move residents to"
                      className="min-w-[10rem] flex-1"
                    >
                      <option value="">Pick a building…</option>
                      {moveTargets.map((building) => (
                        <option key={building.id} value={building.id}>
                          {building.name}
                        </option>
                      ))}
                    </Select>

                    <Button
                      variant="outline"
                      size="sm"
                      loading={moving}
                      disabled={!moveTo}
                      onClick={moveEveryone}
                    >
                      Move everyone
                    </Button>
                  </div>

                  {unplaced.length > 0 && (
                    <p className="pt-1 text-xs leading-relaxed text-due">
                      Still here: {unplaced.join(', ')}. Add vacant flats there, or move
                      them one at a time.
                    </p>
                  )}
                </div>
              )}

              <Field
                label={`Type ${buildingName} to confirm`}
                htmlFor="confirm-name"
                required
              >
                <Input
                  id="confirm-name"
                  value={typed}
                  onChange={(event) => setTyped(event.target.value)}
                  placeholder={buildingName}
                  autoComplete="off"
                />
              </Field>
            </>
          )}
        </div>
      </Modal>
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular font-mono text-ink">{value}</dd>
    </div>
  )
}
