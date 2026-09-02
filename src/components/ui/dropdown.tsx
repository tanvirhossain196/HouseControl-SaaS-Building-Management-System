'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

type DropdownProps = {
  trigger: React.ReactElement
  children: React.ReactNode
  align?: 'start' | 'end'
  className?: string
}

/** Click-to-open menu with outside-click, Escape and arrow-key handling. */
export function Dropdown({ trigger, children, align = 'end', className }: DropdownProps) {
  const [open, setOpen] = React.useState(false)
  const wrapRef = React.useRef<HTMLDivElement>(null)
  const menuRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')
        if (!items?.length) return
        const list = Array.from(items)
        const index = list.indexOf(document.activeElement as HTMLElement)
        const next =
          e.key === 'ArrowDown'
            ? list[(index + 1) % list.length]
            : list[(index - 1 + list.length) % list.length]
        next?.focus()
      }
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={wrapRef} className="relative inline-flex">
      {React.cloneElement(trigger, {
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        onClick: (e: React.MouseEvent) => {
          trigger.props.onClick?.(e)
          setOpen((v) => !v)
        },
      })}
      {open && (
        <div
          ref={menuRef}
          role="menu"
          className={cn(
            'absolute top-[calc(100%+6px)] z-50 min-w-48 animate-scale-in rounded-panel border border-line bg-surface p-1 shadow-lift',
            align === 'end' ? 'right-0' : 'left-0',
            className,
          )}
        >
          {children}
        </div>
      )}
    </div>
  )
}

export function DropdownItem({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      role="menuitem"
      type="button"
      className={cn(
        'flex w-full items-center gap-2 rounded-tile px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-raised focus:bg-raised focus:outline-none',
        className,
      )}
      {...props}
    />
  )
}

export function DropdownSeparator() {
  return <div role="separator" className="my-1 h-px bg-line" />
}
