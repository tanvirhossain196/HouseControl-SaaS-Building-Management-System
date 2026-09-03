'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Scale, SplitSquareHorizontal } from 'lucide-react'
import { rebalanceSharesAction, saveSharesAction } from '@/app/(app)/flats/actions'
import { checkShares, splitEqually } from '@/lib/rent-split'
import { formatTaka, cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormError } from '@/components/auth/form-error'
import { useToast } from '@/components/providers/toast-provider'
import type { Resident } from '@/services/residents.service'

/**
 * The rent split, edited in place.
 *
 * The running total is checked against the flat's rent on every keystroke,
 * using the same function the server and the database trigger use — so the
 * form can never look correct and then be rejected on save.
 */
export function RentSplitEditor({
  flatId,
  monthlyRent,
  residents,
  canEdit,
}: {
  flatId: string
  monthlyRent: number
  residents: Resident[]
  canEdit: boolean
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [shares, setShares] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(
      residents.map((resident) => [resident.id, String(resident.rentShare)]),
    ),
  )
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    setShares(
      Object.fromEntries(
        residents.map((resident) => [resident.id, String(resident.rentShare)]),
      ),
    )
  }, [residents])

  const values = residents.map((resident) => Number(shares[resident.id] ?? 0) || 0)
  const result = checkShares(values, monthlyRent)
  const dirty = residents.some(
    (resident, index) => (values[index] ?? 0) !== resident.rentShare,
  )

  function splitEven() {
    const even = splitEqually(monthlyRent, residents.length)
    setShares(
      Object.fromEntries(
        residents.map((resident, index) => [resident.id, String(even[index])]),
      ),
    )
  }

  async function save() {
    if (!result.ok || pending) return
    setPending(true)
    setError(null)

    const response = await saveSharesAction({
      flatId,
      shares: residents.map((resident, index) => ({
        memberId: resident.id,
        share: values[index] ?? 0,
      })),
    })

    setPending(false)

    if (!response.ok) {
      setError(response.error)
      return
    }

    toast({ tone: 'success', title: 'Rent split saved' })
    router.refresh()
  }

  async function rebalance() {
    setPending(true)
    setError(null)
    const response = await rebalanceSharesAction(flatId, 'proportional')
    setPending(false)

    if (!response.ok) {
      setError(response.error)
      return
    }

    toast({ tone: 'success', title: 'Shares rebalanced to the flat rent' })
    router.refresh()
  }

  if (residents.length === 0) return null

  return (
    <div className="rounded-panel border border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h3 className="font-semibold text-ink">Rent split</h3>
          <p className="mt-1 text-sm text-muted">
            Shares have to add up to {formatTaka(monthlyRent)} before they can be saved.
          </p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={splitEven} disabled={pending}>
              <SplitSquareHorizontal /> Split evenly
            </Button>
            <Button variant="outline" size="sm" onClick={rebalance} loading={pending}>
              <Scale /> Rebalance
            </Button>
          </div>
        )}
      </div>

      <div className="mt-5 space-y-3">
        <FormError message={error} />

        {residents.map((resident, index) => (
          <div key={resident.id} className="flex items-center justify-between gap-4">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-ink">{resident.fullName}</span>
              <span className="block text-xs text-muted">
                {resident.role === 'moderator' ? 'Moderator' : 'Resident'}
                {monthlyRent > 0 &&
                  ` · ${Math.round(((values[index] ?? 0) / monthlyRent) * 100)}% of the rent`}
              </span>
            </span>
            <Input
              inputMode="decimal"
              aria-label={`Rent share for ${resident.fullName}`}
              value={shares[resident.id] ?? ''}
              disabled={!canEdit}
              onChange={(event) =>
                setShares((current) => ({
                  ...current,
                  [resident.id]: event.target.value,
                }))
              }
              className="tabular w-36 text-right font-mono"
            />
          </div>
        ))}
      </div>

      <div
        className={cn(
          'mt-5 flex items-center justify-between gap-3 border-t border-line pt-4 text-sm',
          result.ok ? 'text-paid' : 'text-overdue',
        )}
        aria-live="polite"
      >
        <span>{result.ok ? 'Shares add up' : result.message}</span>
        <span className="tabular font-mono">
          {formatTaka(result.total)} / {formatTaka(monthlyRent)}
        </span>
      </div>

      {canEdit && (
        <div className="mt-4 flex justify-end">
          <Button onClick={save} loading={pending} disabled={!result.ok || !dirty}>
            Save split
          </Button>
        </div>
      )}
    </div>
  )
}
