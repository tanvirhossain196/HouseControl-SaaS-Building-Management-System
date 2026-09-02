import * as React from 'react'
import { cn } from '@/lib/utils'

/** Placeholder block shown while data loads. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn('relative overflow-hidden rounded-tile bg-raised', className)}
      {...props}
    >
      <span className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-surface/60 to-transparent" />
    </div>
  )
}
