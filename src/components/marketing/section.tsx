import * as React from 'react'
import { cn } from '@/lib/utils'

/** Standard marketing section: an id for the nav, a heading, and optional intro. */
export function Section({
  id,
  heading,
  intro,
  headingLevel: H = 'h2',
  className,
  contentClassName,
  children,
}: {
  id?: string
  heading?: string
  intro?: string
  headingLevel?: 'h2' | 'h3'
  className?: string
  contentClassName?: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className={cn('scroll-mt-20 py-18 md:py-26', className)}>
      <div className="container">
        {heading && (
          <div className="max-w-2xl">
            <H className="text-display text-ink">{heading}</H>
            {intro && <p className="mt-4 max-w-[62ch] text-lead text-muted">{intro}</p>}
          </div>
        )}
        <div className={cn(heading && 'mt-12', contentClassName)}>{children}</div>
      </div>
    </section>
  )
}
