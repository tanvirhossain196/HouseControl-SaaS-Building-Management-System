'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from './button'

type ModalProps = {
  open: boolean

  onClose: () => void

  title: string

  description?: string

  children?: React.ReactNode

  footer?: React.ReactNode

  className?: string
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'

/**
 * Accessible dialog:
 * - Escape to close
 * - Focus trapped
 * - Background scroll locked
 * - Click outside closes
 * - Click inside stays open
 */

export function Modal({
  open,

  onClose,

  title,

  description,

  children,

  footer,

  className,
}: ModalProps) {
  const panelRef = React.useRef<HTMLDivElement>(null)

  const [mounted, setMounted] = React.useState(false)

  const titleId = React.useId()

  const descId = React.useId()

  /**
   * onClose is almost always an inline arrow, so it is a new function on every
   * render. Kept in the dependency array it made the focus effect tear down and
   * re-run on each keystroke, and the re-run pulls focus back to the first
   * focusable element — which meant a controlled input could only be typed into
   * one character at a time, clicking back in between. A ref keeps the latest
   * handler without making the effect depend on its identity.
   */
  const onCloseRef = React.useRef(onClose)

  React.useEffect(() => {
    onCloseRef.current = onClose
  })

  React.useEffect(() => setMounted(true), [])

  React.useEffect(() => {
    if (!open) return

    const previous = document.activeElement as HTMLElement | null

    const { overflow } = document.body.style

    document.body.style.overflow = 'hidden'

    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current()
      }

      if (e.key !== 'Tab') return

      const nodes = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE)

      if (!nodes?.length) return

      const first = nodes[0]!

      const last = nodes[nodes.length - 1]!

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()

        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()

        first.focus()
      }
    }

    document.addEventListener('keydown', onKey)

    return () => {
      document.removeEventListener('keydown', onKey)

      document.body.style.overflow = overflow

      previous?.focus()
    }
    // `open` only. Everything else this effect touches is read through a ref,
    // so it runs once per opening rather than once per render.
  }, [open])

  if (!mounted || !open) return null

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4">
      {/* Backdrop */}

      <div
        className="absolute inset-0 animate-fade-in bg-ink/45 backdrop-blur-[2px]"

        onClick={onClose}

        aria-hidden
      />

      {/* Modal Content */}

      <div
        ref={panelRef}

        role="dialog"

        aria-modal="true"

        aria-labelledby={titleId}

        aria-describedby={description ? descId : undefined}

        onClick={(event) => event.stopPropagation()}

        className={cn(
          `relative flex max-h-[92dvh] w-full max-w-lg animate-scale-in flex-col rounded-t-sheet border border-line bg-surface shadow-lift sm:max-h-[88dvh] sm:rounded-sheet`,

          className,
        )}
      >
        {/* Header */}

        <div className="flex shrink-0 items-start justify-between gap-4 p-5 pb-4 sm:p-6 sm:pb-4">
          <div className="space-y-1">
            <h2
              id={titleId}

              className="text-title"
            >
              {title}
            </h2>

            {description && (
              <p
                id={descId}

                className="text-sm text-muted"
              >
                {description}
              </p>
            )}
          </div>

          <Button
            variant="quiet"

            size="icon-sm"

            onClick={onClose}

            aria-label="Close dialog"
          >
            <X />
          </Button>
        </div>

        {/* Body */}

        {children && (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2 text-sm text-muted sm:px-6">
            {children}
          </div>
        )}

        {/* Footer */}

        {footer && (
          <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-line p-5 sm:p-6">
            {footer}
          </div>
        )}
      </div>
    </div>,

    document.body,
  )
}
