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

/** Accessible dialog: Escape to close, focus trapped, background scroll locked. */
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

  React.useEffect(() => setMounted(true), [])

  React.useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
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
  }, [open, onClose])

  if (!mounted || !open) return null

  return createPortal(
    // Bottom sheet on a phone, centred card from `sm` up. The padding keeps
    // it clear of the notch and the home indicator on iOS.
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="absolute inset-0 animate-fade-in bg-ink/45 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className={cn(
          // `max-h` and the inner scroll are the point: a long form on a
          // short screen used to run off the bottom with its buttons
          // unreachable. Now the body scrolls and the footer stays put.
          'relative flex max-h-[92dvh] w-full max-w-lg animate-scale-in flex-col rounded-t-sheet border border-line bg-surface shadow-lift sm:max-h-[88dvh] sm:rounded-sheet',
          className,
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 p-5 pb-4 sm:p-6 sm:pb-4">
          <div className="space-y-1">
            <h2 id={titleId} className="text-title">
              {title}
            </h2>
            {description && (
              <p id={descId} className="text-sm text-muted">
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
        {children && (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2 text-sm text-muted sm:px-6">
            {children}
          </div>
        )}
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
