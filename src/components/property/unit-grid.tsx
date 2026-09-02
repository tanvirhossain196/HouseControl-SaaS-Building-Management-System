'use client'

import * as React from 'react'
import { formatTaka } from '@/lib/utils'
import { floorLabel } from '@/lib/units'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import type { FlatWithCounts } from '@/services/flats.service'
import type { OccupancyStatus } from '@/types'

const tone: Record<OccupancyStatus, string> = {
  occupied: 'border-paid/35 bg-paid-soft text-paid hover:border-paid',
  vacant: 'border-line bg-raised text-vacant hover:border-vacant/60',
  reserved: 'border-due/35 bg-due-soft text-due hover:border-due',
  not_rentable: 'border-line bg-surface text-muted hover:border-ink/20',
}

const label: Record<OccupancyStatus, string> = {
  occupied: 'Occupied',
  vacant: 'Vacant',
  reserved: 'Reserved',
  not_rentable: 'Not rentable',
}

const badgeTone: Record<OccupancyStatus, 'paid' | 'due' | 'neutral'> = {
  occupied: 'paid',
  vacant: 'neutral',
  reserved: 'due',
  not_rentable: 'neutral',
}

/**
 * The building as a stack of floors, the same shape as the landing page but
 * fed by real data. Selecting a unit shows its detail beside the grid rather
 * than navigating away, because comparing two flats is the common task.
 */
export function UnitGrid({ flats }: { flats: FlatWithCounts[] }) {
  const [selectedId, setSelectedId] = React.useState<string | null>(flats[0]?.id ?? null)
  const selected = flats.find((flat) => flat.id === selectedId) ?? flats[0] ?? null

  const floors = React.useMemo(() => {
    const grouped = new Map<number, FlatWithCounts[]>()
    for (const flat of flats) {
      const list = grouped.get(flat.floor) ?? []
      list.push(flat)
      grouped.set(flat.floor, list)
    }
    return [...grouped.entries()].sort((a, b) => b[0] - a[0])
  }, [flats])

  if (flats.length === 0) return null

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_minmax(0,17rem)]">
      <div className="rounded-panel border border-line bg-surface p-4">
        <ul className="space-y-1.5">
          {floors.map(([floor, units]) => (
            <li key={floor} className="flex items-center gap-3">
              <span className="tabular w-7 shrink-0 font-mono text-xs text-muted">
                {floorLabel(floor, 'ground_g')}
              </span>
              <div className="flex flex-1 flex-wrap gap-1.5">
                {units.map((flat) => (
                  <button
                    key={flat.id}
                    type="button"
                    onClick={() => setSelectedId(flat.id)}
                    aria-pressed={flat.id === selected?.id}
                    className={cn(
                      'flex min-w-16 items-center justify-between gap-2 rounded-tile border px-2.5 py-2 text-left transition-colors',
                      tone[flat.occupancy_status],
                      flat.id === selected?.id && 'ring-2 ring-primary/45',
                    )}
                  >
                    <span className="tabular font-mono text-xs font-medium">
                      {flat.unit_number}
                    </span>
                    <span aria-hidden className="size-1.5 rounded-full bg-current" />
                    <span className="sr-only">
                      {label[flat.occupancy_status]}, {flat.residents} residents
                    </span>
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>

        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-line pt-3">
          {(Object.keys(label) as OccupancyStatus[]).map((status) => (
            <li
              key={status}
              className="flex items-center gap-1.5 text-[0.7rem] text-muted"
            >
              <span
                aria-hidden
                className={cn(
                  'size-2 rounded-full',
                  status === 'occupied' && 'bg-paid',
                  status === 'vacant' && 'bg-vacant',
                  status === 'reserved' && 'bg-due',
                  status === 'not_rentable' && 'bg-line',
                )}
              />
              {label[status]}
            </li>
          ))}
        </ul>
      </div>

      {selected && (
        <div
          aria-live="polite"
          className="rounded-panel border border-line bg-surface p-5"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="tabular font-mono font-semibold text-ink">
              Flat {selected.unit_number}
            </span>
            <Badge tone={badgeTone[selected.occupancy_status]} dot>
              {label[selected.occupancy_status]}
            </Badge>
          </div>

          <dl className="mt-4 space-y-2 text-xs text-muted">
            <div className="flex justify-between gap-2">
              <dt>Monthly rent</dt>
              <dd className="tabular font-mono text-ink">
                {formatTaka(Number(selected.monthly_rent))}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Rent day</dt>
              <dd className="tabular font-mono text-ink">{selected.rent_due_day}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Residents</dt>
              <dd className="tabular font-mono text-ink">{selected.residents || '—'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Moderator</dt>
              <dd className="text-ink">{selected.moderatorName ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Size</dt>
              <dd className="tabular font-mono text-ink">
                {selected.size_sqft ? `${selected.size_sqft} sq ft` : '—'}
              </dd>
            </div>
          </dl>

          {selected.outstanding > 0 && (
            <p className="mt-4 border-t border-line pt-3 text-xs text-overdue">
              {formatTaka(selected.outstanding)} outstanding
            </p>
          )}
        </div>
      )}
    </div>
  )
}
