'use client'

import Link from 'next/link'

import { cn } from '@/lib/utils'

/**
 * The wordmark.
 *
 * The mark is the project's own SVG, served from /public rather than inlined.
 * A file keeps the artwork somewhere a designer can open and replace without
 * touching a component — which matters more here than theming it, since the
 * mark is already drawn to sit on either background.
 *
 * It is an <img> rather than next/image on purpose. next/image refuses SVG
 * unless dangerouslyAllowSVG is turned on, and there is nothing for it to
 * optimise: a vector has no resolutions to pick between. The explicit width and
 * height are what stop the header jumping while it loads.
 */
export function Logo({
  className,
  href = '/',
  showWordmark = true,
  size = 44,
}: {
  className?: string
  href?: string
  showWordmark?: boolean
  /** Pixel size of the mark. The wordmark keeps its own size. */
  size?: number
}) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center gap-2.5 rounded-control focus-visible:ring-2',
        className,
      )}
      aria-label="HouseControl home"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/assets/logo/mark.svg"
        alt=""
        width={size}
        height={size}
        className="shrink-0"
        style={{ width: size, height: size }}
      />

      {showWordmark && (
        <span className="text-lg font-semibold tracking-[-0.02em] text-ink">
          House<span className="text-muted">Control</span>
        </span>
      )}
    </Link>
  )
}
