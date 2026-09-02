'use client'

import * as React from 'react'
import { DoorOpen } from 'lucide-react'
import { demoBuilding, statusLabel, type Unit, type UnitStatus } from '@/content/building'
import { cn, dueLabel, formatTaka } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

const tileTone: Record<UnitStatus, string> = {
  paid: 'border-paid/35 bg-paid-soft text-paid hover:border-paid',
  due: 'border-due/35 bg-due-soft text-due hover:border-due',
  overdue: 'border-overdue/40 bg-overdue-soft text-overdue hover:border-overdue',
  vacant: 'border-line bg-raised text-vacant hover:border-vacant/60',
}

const badgeTone: Record<UnitStatus, 'paid' | 'due' | 'overdue' | 'neutral'> = {
  paid: 'paid',
  due: 'due',
  overdue: 'overdue',
  vacant: 'neutral',
}

const allUnits = demoBuilding.floors.flatMap((f) => f.units)
const billable = allUnits.filter((u) => u.status !== 'vacant')
const collected = billable
  .filter((u) => u.status === 'paid')
  .reduce((sum, u) => sum + u.rent, 0)
const expected = billable.reduce((sum, u) => sum + u.rent, 0)
const collectedPct = Math.round((collected / expected) * 100)

/**
 * The building itself, as a control panel: floors stacked top to bottom,
 * one tile per unit, colour carrying this month's rent status.
 */
export function BuildingPanel() {
  const [selected, setSelected] = React.useState<Unit>(allUnits[4]!)

  return (
    <div className="overflow-hidden rounded-sheet border border-line bg-surface shadow-lift">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line px-5 py-4">
        <div>
          <p className="font-semibold text-ink">{demoBuilding.name}</p>
          <p className="text-xs text-muted">{demoBuilding.address}</p>
        </div>
        <div className="text-right">
          <p className="tabular font-mono text-sm font-medium text-ink">
            {formatTaka(collected)}{' '}
            <span className="text-muted">of {formatTaka(expected)}</span>
          </p>
          <p className="text-xs text-muted">collected in September</p>
        </div>
      </div>

      <div className="px-5 pt-4">
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-raised"
          role="img"
          aria-label={`${collectedPct} percent of September rent collected`}
        >
          <div
            className="h-full origin-left animate-meter-fill rounded-full bg-paid"
            style={{ width: `${collectedPct}%` }}
          />
        </div>
      </div>

      <div className="grid gap-5 p-5 sm:grid-cols-[1fr_minmax(0,15rem)]">
        <div>
          <ul className="space-y-1.5">
            {demoBuilding.floors.map((floor) => (
              <li key={floor.label} className="flex items-center gap-3">
                <span className="tabular w-6 shrink-0 font-mono text-xs text-muted">
                  {floor.label}
                </span>
                <div className="grid flex-1 grid-cols-2 gap-1.5">
                  {floor.units.map((unit) => {
                    const active = unit.id === selected.id
                    return (
                      <button
                        key={unit.id}
                        type="button"
                        onClick={() => setSelected(unit)}
                        onMouseEnter={() => setSelected(unit)}
                        aria-pressed={active}
                        className={cn(
                          'flex items-center justify-between rounded-tile border px-2.5 py-2 text-left transition-colors duration-150',
                          tileTone[unit.status],
                          active && 'ring-2 ring-primary/45',
                        )}
                      >
                        <span className="tabular font-mono text-xs font-medium">
                          {unit.id}
                        </span>
                        <span
                          aria-hidden
                          className={cn(
                            'size-1.5 rounded-full bg-current',
                            unit.status === 'overdue' && 'ring-2 ring-overdue/25',
                          )}
                        />
                        <span className="sr-only">
                          {unit.resident}, {statusLabel[unit.status]}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </li>
            ))}
          </ul>

          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-line pt-3">
            {(Object.keys(statusLabel) as UnitStatus[]).map((s) => (
              <li key={s} className="flex items-center gap-1.5 text-[0.7rem] text-muted">
                <span
                  aria-hidden
                  className={cn(
                    'size-2 rounded-full',
                    s === 'paid' && 'bg-paid',
                    s === 'due' && 'bg-due',
                    s === 'overdue' && 'bg-overdue',
                    s === 'vacant' && 'bg-vacant',
                  )}
                />
                {statusLabel[s]}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-4">
          <div
            aria-live="polite"
            className="rounded-panel border border-line bg-raised/50 p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="tabular font-mono text-sm font-semibold text-ink">
                Flat {selected.id}
              </span>
              <Badge tone={badgeTone[selected.status]} dot>
                {statusLabel[selected.status]}
              </Badge>
            </div>
            <p className="mt-2 text-sm font-medium text-ink">{selected.resident}</p>
            <dl className="mt-3 space-y-1.5 text-xs text-muted">
              <div className="flex justify-between gap-2">
                <dt>Monthly rent</dt>
                <dd className="tabular font-mono text-ink">
                  {selected.rent ? formatTaka(selected.rent) : '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Residents</dt>
                <dd className="tabular font-mono text-ink">{selected.members || '—'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Rent day</dt>
                <dd className="text-ink">
                  {selected.status === 'vacant' ? '—' : dueLabel(selected.daysToDue)}
                </dd>
              </div>
            </dl>
            <p className="mt-3 border-t border-line pt-3 text-xs leading-relaxed text-muted">
              {selected.note}
            </p>
          </div>

          <div className="rounded-panel border border-line p-4">
            <p className="flex items-center gap-2 text-xs font-semibold text-ink">
              <DoorOpen className="size-3.5 text-muted" aria-hidden />
              At the gate today
            </p>
            <ul className="mt-3 space-y-2">
              {demoBuilding.gate.map((entry) => (
                <li key={entry.time} className="flex items-baseline gap-2 text-xs">
                  <span className="tabular font-mono text-muted">{entry.time}</span>
                  <span className="min-w-0 flex-1 truncate text-ink">{entry.name}</span>
                  <span className="tabular font-mono text-muted">{entry.flat}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
