'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/** Hover/focus tooltip. Content is exposed to screen readers via aria-describedby. */
export function Tooltip({
  label,
  side = 'top',
  children,
  className,
}: {
  label: string
  side?: 'top' | 'bottom'
  children: React.ReactElement
  className?: string
}) {
  const id = React.useId()
  const [open, setOpen] = React.useState(false)

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {React.cloneElement(children, { 'aria-describedby': id })}
      <span
        role="tooltip"
        id={id}
        hidden={!open}
        className={cn(
          'pointer-events-none absolute left-1/2 z-50 w-max max-w-56 -translate-x-1/2 animate-fade-in rounded-control bg-ink px-2.5 py-1.5 text-xs font-medium text-paper shadow-lift',
          side === 'top' ? 'bottom-[calc(100%+8px)]' : 'top-[calc(100%+8px)]',
          className,
        )}
      >
        {label}
      </span>
    </span>
  )
}
