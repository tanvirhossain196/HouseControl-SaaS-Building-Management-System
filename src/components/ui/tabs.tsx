'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export type TabItem = { id: string; label: string; content: React.ReactNode }

/** Tabs with roving focus and arrow-key navigation (WAI-ARIA tabs pattern). */
export function Tabs({
  items,
  defaultId,
  className,
}: {
  items: TabItem[]
  defaultId?: string
  className?: string
}) {
  const [active, setActive] = React.useState(defaultId ?? items[0]?.id ?? '')
  const listRef = React.useRef<HTMLDivElement>(null)

  const onKeyDown = (e: React.KeyboardEvent) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
    if (!keys.includes(e.key)) return
    e.preventDefault()
    const index = items.findIndex((i) => i.id === active)
    const nextIndex =
      e.key === 'ArrowRight'
        ? (index + 1) % items.length
        : e.key === 'ArrowLeft'
          ? (index - 1 + items.length) % items.length
          : e.key === 'Home'
            ? 0
            : items.length - 1
    const next = items[nextIndex]
    if (!next) return
    setActive(next.id)
    listRef.current?.querySelector<HTMLElement>(`#tab-${next.id}`)?.focus()
  }

  return (
    <div className={className}>
      <div
        ref={listRef}
        role="tablist"
        onKeyDown={onKeyDown}
        className="flex gap-1 overflow-x-auto border-b border-line"
      >
        {items.map((item) => {
          const selected = item.id === active
          return (
            <button
              key={item.id}
              id={`tab-${item.id}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(item.id)}
              className={cn(
                '-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors',
                selected
                  ? 'border-primary text-ink'
                  : 'border-transparent text-muted hover:text-ink',
              )}
            >
              {item.label}
            </button>
          )
        })}
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          id={`panel-${item.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${item.id}`}
          hidden={item.id !== active}
          className="pt-5"
        >
          {item.content}
        </div>
      ))}
    </div>
  )
}
