'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

type DropdownProps = {
  trigger: React.ReactElement
  children: React.ReactNode
  align?: 'start' | 'end'
  className?: string
}

type MenuPosition = {
  top: number
  left?: number
  right?: number
}

/**
 * Portal-based dropdown.
 *
 * The menu is rendered directly inside document.body, so it will not be
 * clipped by cards, lists or containers with overflow-hidden.
 */
export function Dropdown({ trigger, children, align = 'end', className }: DropdownProps) {
  const [open, setOpen] = React.useState(false)
  const [mounted, setMounted] = React.useState(false)
  const [position, setPosition] = React.useState<MenuPosition | null>(null)

  const wrapRef = React.useRef<HTMLDivElement>(null)
  const menuRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const updatePosition = React.useCallback(() => {
    const element = wrapRef.current

    if (!element) return

    const rect = element.getBoundingClientRect()
    const menuWidth = 192
    const gap = 6
    const edge = 8

    if (align === 'start') {
      const left = Math.min(
        Math.max(edge, rect.left),
        window.innerWidth - menuWidth - edge,
      )

      setPosition({
        top: rect.bottom + gap,
        left,
      })

      return
    }

    const right = Math.max(edge, window.innerWidth - rect.right)

    setPosition({
      top: rect.bottom + gap,
      right,
    })
  }, [align])

  React.useEffect(() => {
    if (!open) return

    updatePosition()

    const onPointer = (event: MouseEvent) => {
      const target = event.target as HTMLElement

      if (wrapRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return

      /*
       * Modals render through a React portal into body. Do not close the
       * dropdown while the user is interacting with an opened modal.
       */
      if (target.closest?.('[role="dialog"]')) return

      setOpen(false)
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        return
      }

      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
        return
      }

      event.preventDefault()

      const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')

      if (!items?.length) return

      const list = Array.from(items)
      const currentIndex = list.indexOf(document.activeElement as HTMLElement)

      const nextIndex =
        event.key === 'ArrowDown'
          ? (currentIndex + 1) % list.length
          : (currentIndex - 1 + list.length) % list.length

      list[nextIndex]?.focus()
    }

    const onViewportChange = () => {
      updatePosition()
    }

    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('scroll', onViewportChange, true)

    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onViewportChange)
      window.removeEventListener('scroll', onViewportChange, true)
    }
  }, [open, updatePosition])

  const menu =
    open && mounted && position
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            className={cn(
              'fixed z-[9999] min-w-48 animate-scale-in rounded-panel border border-line bg-surface p-1 shadow-lift',
              className,
            )}
            style={{
              top: position.top,
              left: position.left,
              right: position.right,
            }}
          >
            {children}
          </div>,
          document.body,
        )
      : null

  return (
    <div ref={wrapRef} className="relative inline-flex">
      {React.cloneElement(trigger, {
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        onClick: (event: React.MouseEvent) => {
          trigger.props.onClick?.(event)
          setOpen((value) => !value)
        },
      })}

      {menu}
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
