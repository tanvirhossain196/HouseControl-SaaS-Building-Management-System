'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'

export type FilterOption = {
  value: string
  label: string
  count: number
}

/**
 * A row of filters with the number behind each one.
 *
 * The counts are the point. A queue of sixty payments is not made navigable by
 * a list of building names — it is made navigable by seeing that fifty-two of
 * them are in one building, so that is where the work is. Without the number a
 * filter is a guess about where to look.
 *
 * Options matching nothing are dropped by default — a chip reading zero is a
 * dead end dressed up as a choice. Set `showEmpty` where the row is a map of
 * what exists rather than a list of what is waiting: a building with no
 * requests still has to appear, because leaving it out reads as "no such
 * building" instead of "nothing here".
 *
 * A single option still gets a row. It is not a filter then — it is a label
 * saying where everything below came from, which earns the line on its own. The
 * "All" chip is dropped in that case, because it would say exactly what the one
 * option beside it already says.
 */
export function FilterChips({
  label,
  options,
  value,
  onChange,
  allLabel = 'All',
  showEmpty = false,
}: {
  label: string
  options: FilterOption[]
  value: string | null
  onChange: (next: string | null) => void
  allLabel?: string
  showEmpty?: boolean
}) {
  const live = showEmpty ? options : options.filter((option) => option.count > 0)

  if (live.length === 0) return null

  const showAll = live.length > 1

  const total = live.reduce((sum, option) => sum + option.count, 0)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </span>

      {showAll && (
        <Chip active={value === null} onClick={() => onChange(null)}>
          {allLabel}
          <Count>{total}</Count>
        </Chip>
      )}

      {live.map((option) => (
        <Chip
          key={option.value}
          active={value === option.value}
          muted={option.count === 0}
          onClick={() => onChange(value === option.value ? null : option.value)}
        >
          {option.label}
          <Count>{option.count}</Count>
        </Chip>
      ))}
    </div>
  )
}

function Chip({
  active,
  onClick,
  children,
  muted = false,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  /** Nothing waiting under it — still selectable, just not calling for attention. */
  muted?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-control border px-2.5 py-1 text-xs transition-colors',
        active
          ? 'border-primary/40 bg-primary-soft font-medium text-primary'
          : muted
            ? 'border-line/60 bg-surface text-muted/60 hover:border-ink/20 hover:text-muted'
            : 'border-line bg-surface text-muted hover:border-ink/25 hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}

function Count({ children }: { children: React.ReactNode }) {
  return <span className="tabular font-mono text-[0.6875rem] opacity-70">{children}</span>
}