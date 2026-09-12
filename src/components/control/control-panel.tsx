'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  Banknote,
  DoorOpen,
  ReceiptText,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { BillMonth } from '@/components/money/bill-month'
import { RentScheduleForm } from '@/components/money/rent-schedule-form'
import { cn, formatTaka } from '@/lib/utils'
import { floorLabel } from '@/lib/units'
import type { ControlFlat, RentState } from '@/services/control.service'

/**
 * The building at a glance.
 *
 * Tiles are coloured by whether the month has been paid, not by whether the
 * flat is occupied. Occupancy is stable and boring; rent is the thing an owner
 * opens this page to check, and a grid that shows the wrong one is a grid
 * nobody looks at twice.
 *
 * Selecting a flat only changes the panel beside it. Anything that edits
 * something links out to the page that owns that job, so there is one place to
 * change rent and one place to change residents, not two.
 */

const TILE: Record<RentState, string> = {
  paid: 'border-paid/40 bg-paid/12 text-paid',
  partial: 'border-due/40 bg-due/12 text-due',
  due: 'border-line bg-raised text-muted',
  late: 'border-due/40 bg-due/12 text-due',
  overdue: 'border-overdue/45 bg-overdue/12 text-overdue',
  unbilled: 'border-line bg-surface text-muted',
  vacant: 'border-line bg-surface/60 text-muted/70',
}

const LABEL: Record<RentState, string> = {
  paid: 'Rent paid',
  partial: 'Part paid',
  due: 'Payment due',
  late: 'Late',
  overdue: 'Overdue',
  unbilled: 'Not billed',
  vacant: 'Vacant',
}

const BADGE: Record<RentState, 'paid' | 'due' | 'overdue' | 'neutral'> = {
  paid: 'paid',
  partial: 'due',
  due: 'neutral',
  late: 'due',
  overdue: 'overdue',
  unbilled: 'neutral',
  vacant: 'neutral',
}

const LEGEND: RentState[] = ['paid', 'due', 'late', 'overdue', 'vacant']

/**
 * Where each part of the building is actually managed.
 *
 * The panel shows the month at a glance and then hands over — every number on
 * it belongs to a screen that can change it. Without these the page is a
 * dashboard you have to leave through the sidebar, which means remembering
 * which of nine entries owns the thing you were just looking at.
 */
const DESTINATIONS = [
  { href: '/dues', label: 'Dues', icon: ReceiptText },
  { href: '/payments', label: 'Payments', icon: Banknote },
  { href: '/remittances', label: 'Handovers', icon: Wallet },
  { href: '/admin/residents', label: 'Residents', icon: Users },
  { href: '/maintenance', label: 'Repairs', icon: Wrench },
  { href: '/gate', label: 'Gate', icon: DoorOpen },
] as const

export function ControlPanel({
  flats,
  gate,
  monthLabel,
  manageableFlatIds,
}: {
  flats: ControlFlat[]
  gate: Array<{
    id: string
    name: string
    unit: string | null
    at: string | null
    state: string
  }>
  monthLabel: string
  /** Flats this person may bill or reschedule — decided on the server. */
  manageableFlatIds: string[]
}) {
  const manageable = React.useMemo(() => new Set(manageableFlatIds), [manageableFlatIds])

  const [selectedId, setSelectedId] = React.useState<string | null>(flats[0]?.id ?? null)
  const selected = flats.find((flat) => flat.id === selectedId) ?? flats[0] ?? null

  const floors = React.useMemo(() => {
    const grouped = new Map<number, ControlFlat[]>()

    for (const flat of flats) {
      const list = grouped.get(flat.floor) ?? []
      list.push(flat)
      grouped.set(flat.floor, list)
    }

    // Top floor first, the way anyone standing outside reads a building.
    return [...grouped.entries()].sort((a, b) => b[0] - a[0])
  }, [flats])

  if (flats.length === 0) {
    return (
      <div className="rounded-panel border border-dashed border-line bg-surface px-6 py-12 text-center">
        <p className="text-sm font-medium text-ink">No units yet</p>
        <p className="mt-1 text-sm text-muted">
          Add flats to this building and they appear here, one tile each.
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,20rem)]">
      <div className="rounded-panel border border-line bg-surface p-4">
        <ul className="space-y-2">
          {floors.map(([floor, units]) => (
            <li key={floor} className="flex items-start gap-3">
              <span className="tabular w-7 shrink-0 pt-2 font-mono text-xs text-muted">
                {floorLabel(floor, 'ground_g')}
              </span>

              <div className="flex flex-1 flex-wrap gap-2">
                {units.map((flat) => (
                  <button
                    key={flat.id}
                    type="button"
                    onClick={() => setSelectedId(flat.id)}
                    aria-pressed={flat.id === selected?.id}
                    className={cn(
                      'flex min-w-20 items-center justify-between gap-2 rounded-tile border px-3 py-2.5 text-left transition-colors',
                      TILE[flat.rentState],
                      flat.id === selected?.id && 'ring-2 ring-primary/45',
                    )}
                  >
                    <span className="tabular font-mono text-xs font-medium">
                      {flat.unit_number}
                    </span>

                    <span aria-hidden className="size-1.5 rounded-full bg-current" />

                    <span className="sr-only">
                      {LABEL[flat.rentState]}, {flat.residents} residents
                    </span>
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>

        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-line pt-3">
          {LEGEND.map((state) => (
            <li key={state} className="flex items-center gap-1.5 text-xs text-muted">
              <span
                aria-hidden
                className={cn(
                  'size-1.5 rounded-full',
                  state === 'paid' && 'bg-paid',
                  state === 'due' && 'bg-line',
                  state === 'late' && 'bg-due',
                  state === 'overdue' && 'bg-overdue',
                  state === 'vacant' && 'bg-muted/40',
                )}
              />
              {LABEL[state]}
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-4">
        <nav
          aria-label="Manage"
          className="grid grid-cols-3 gap-2 rounded-panel border border-line bg-surface p-3"
        >
          {DESTINATIONS.map((destination) => (
            <Link
              key={destination.href}
              href={destination.href}
              className="flex flex-col items-center gap-1.5 rounded-control px-2 py-2.5 text-center text-xs text-muted transition-colors hover:bg-raised hover:text-ink"
            >
              <destination.icon className="size-4" aria-hidden />
              {destination.label}
            </Link>
          ))}
        </nav>

        {selected && (
          <div className="rounded-panel border border-line bg-surface p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-title text-ink">Flat {selected.unit_number}</p>
                {selected.moderatorName && (
                  <p className="mt-0.5 text-sm text-muted">{selected.moderatorName}</p>
                )}
              </div>

              <Badge tone={BADGE[selected.rentState]} dot>
                {LABEL[selected.rentState]}
              </Badge>
            </div>

            <dl className="mt-4 space-y-2.5 border-t border-line pt-4 text-sm">
              <Row
                label="Monthly rent"
                value={formatTaka(Number(selected.monthly_rent))}
              />
              <Row label="Residents" value={String(selected.residents)} />
              <Row
                label={`Billed in ${monthLabel}`}
                value={selected.billed > 0 ? formatTaka(selected.billed) : 'Not billed'}
              />
              {selected.billed > 0 && (
                <Row label="Paid" value={formatTaka(selected.paid)} />
              )}
              <Row label="Rent day" value={`Every month ${selected.rent_due_day}`} />
            </dl>

            {manageable.has(selected.id) && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                <BillMonth
                  scope="flat"
                  id={selected.id}
                  label={`flat ${selected.unit_number}`}
                />

                <RentScheduleForm
                  flatId={selected.id}
                  currentDay={selected.rent_due_day}
                  unitNumber={selected.unit_number}
                />
              </div>
            )}

            <Link
              href={`/flats/${selected.id}`}
              className="mt-4 inline-flex items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline"
            >
              Residents, dues and history
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        )}

        <div className="rounded-panel border border-line bg-surface p-5">
          <p className="flex items-center gap-2 text-sm font-medium text-ink">
            <DoorOpen className="size-4 text-muted" aria-hidden />
            At the gate today
          </p>

          {gate.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Nobody logged yet today.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {gate.map((visit) => (
                <li key={visit.id} className="flex items-baseline justify-between gap-3">
                  <span className="tabular shrink-0 font-mono text-xs text-muted">
                    {visit.at ? visit.at.slice(11, 16) : '—'}
                  </span>

                  <span className="min-w-0 flex-1 truncate text-sm text-ink">
                    {visit.name}
                  </span>

                  <span className="tabular shrink-0 font-mono text-xs text-muted">
                    {visit.unit ?? 'Building'}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <Link
            href="/gate"
            className="mt-4 inline-flex items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline"
          >
            Open the gate log
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular font-mono text-ink">{value}</dd>
    </div>
  )
}
