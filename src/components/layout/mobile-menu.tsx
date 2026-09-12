'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * One open/closed state, shared by the button and the drawer.
 *
 * The trigger belongs in the header, beside the bell and the avatar, and the
 * drawer belongs with the navigation it contains. Those are different parts of
 * the tree, so the state has to sit above both. Keeping it inside the sidebar —
 * as it was — is why the trigger had to live in a strip of its own under the
 * header, taking a row of a phone screen to hold one button.
 */

type MobileMenu = {
  open: boolean
  setOpen: (next: boolean) => void
}

const Context = React.createContext<MobileMenu | null>(null)

export function MobileMenuProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpenState] = React.useState(false)

  /**
   * A setter that never changes identity.
   *
   * Consumers list it in effect dependencies — closing the drawer on navigation,
   * binding Escape — and a setter recreated on every render would re-run those
   * effects on every render. useState's own setter is stable; wrapping it in a
   * context object is what loses that, so it is restored here rather than
   * silenced with a lint comment at each call site.
   */
  const setOpen = React.useCallback((next: boolean) => setOpenState(next), [])

  const value = React.useMemo(() => ({ open, setOpen }), [open, setOpen])

  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useMobileMenu(): MobileMenu {
  const value = React.useContext(Context)

  if (!value) {
    throw new Error('useMobileMenu must be used inside MobileMenuProvider')
  }

  return value
}

/**
 * Three lines, each shorter than the one above, all flush right.
 *
 * Drawn rather than taken from the icon set: every library gives three bars of
 * equal length, and the taper is what makes the mark look drawn rather than
 * default. Right-aligned because the drawer opens from the right — the short
 * edge points at where the panel is about to come from.
 *
 * The bars fold into a cross when the drawer is open, and all three return to
 * full width there, or the cross would have arms of different lengths.
 */
export function MobileMenuButton({ className }: { className?: string }) {
  const { open, setOpen } = useMobileMenu()

  const bar = 'absolute h-[1.5px] rounded-full bg-current transition-all duration-200'

  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      aria-controls="app-sidebar-drawer"
      aria-label={open ? 'Close the menu' : 'Open the menu'}
      className={cn(
        'relative inline-flex size-9 items-center justify-center rounded-control text-ink transition-colors hover:bg-raised lg:hidden',
        className,
      )}
    >
      <span aria-hidden className="relative block size-4">
        <span
          className={cn(bar, 'right-0 w-4', open ? 'top-1/2 rotate-45' : 'top-[3px]')}
        />
        <span
          className={cn(
            bar,
            'right-0 top-1/2 w-[0.8125rem] -translate-y-1/2',
            open && 'w-0 opacity-0',
          )}
        />
        <span
          className={cn(
            bar,
            'right-0',
            open ? 'top-1/2 w-4 -rotate-45' : 'bottom-[3px] w-2.5',
          )}
        />
      </span>
    </button>
  )
}
