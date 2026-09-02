'use client'

import * as React from 'react'
import { ArrowUp } from 'lucide-react'

/** Appears after the first viewport of scrolling; returns focus to the top of the page. */
export function BackToTop() {
  const [show, setShow] = React.useState(false)

  React.useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 700)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (!show) return null

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="fixed bottom-5 left-5 z-40 inline-flex size-10 animate-fade-in items-center justify-center rounded-full border border-line bg-surface text-muted shadow-lift transition-colors hover:text-ink"
      aria-label="Back to top"
    >
      <ArrowUp className="size-4" />
    </button>
  )
}
