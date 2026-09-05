'use client'

import * as React from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

/**
 * The wordmark.
 *
 * Drop a file at `public/assets/logo/house-control.jpg` and it is used
 * automatically; without one, the built-in mark is drawn instead. The
 * fallback runs on the image's own `onError`, so a missing file degrades to
 * something correct rather than to a broken-image icon — and no build step or
 * environment variable is needed to switch between them.
 */
const LOGO_SRC = '/assets/logo/house-control.jpg'

export function Logo({
  className,
  href = '/',
  showWordmark = true,
}: {
  className?: string
  href?: string
  showWordmark?: boolean
}) {
  const [hasImage, setHasImage] = React.useState(true)

  return (
    <Link
      href={href}
      className={cn('inline-flex items-center gap-2.5 rounded-control', className)}
      aria-label="HouseControl home"
    >
      {hasImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={LOGO_SRC}
          alt=""
          width={32}
          height={32}
          className="size-8 rounded-tile object-cover"
          onError={() => setHasImage(false)}
        />
      ) : (
        <span
          aria-hidden
          className="grid size-8 grid-cols-2 grid-rows-3 gap-[2px] rounded-tile bg-primary p-[5px]"
        >
          <span className="rounded-[1px] bg-primary-fg/35" />
          <span className="rounded-[1px] bg-primary-fg/35" />
          <span className="rounded-[1px] bg-accent" />
          <span className="rounded-[1px] bg-primary-fg/35" />
          <span className="rounded-[1px] bg-primary-fg/35" />
          <span className="rounded-[1px] bg-primary-fg/35" />
        </span>
      )}

      {showWordmark && (
        <span className="text-[1.0625rem] font-semibold tracking-[-0.02em] text-ink">
          House<span className="text-muted">Control</span>
        </span>
      )}
    </Link>
  )
}
