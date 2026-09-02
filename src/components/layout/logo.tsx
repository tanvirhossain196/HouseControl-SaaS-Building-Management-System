import Link from 'next/link'
import { cn } from '@/lib/utils'

/** Wordmark + building mark. The mark reads as three stacked floors with a lit unit. */
export function Logo({ className, href = '/' }: { className?: string; href?: string }) {
  return (
    <Link
      href={href}
      className={cn('inline-flex items-center gap-2.5 rounded-control', className)}
      aria-label="HouseControl home"
    >
      <span className="grid size-8 grid-cols-2 grid-rows-3 gap-[2px] rounded-tile bg-primary p-[5px]">
        <span className="rounded-[1px] bg-primary-fg/35" />
        <span className="rounded-[1px] bg-primary-fg/35" />
        <span className="rounded-[1px] bg-accent" />
        <span className="rounded-[1px] bg-primary-fg/35" />
        <span className="rounded-[1px] bg-primary-fg/35" />
        <span className="rounded-[1px] bg-primary-fg/35" />
      </span>
      <span className="text-[1.0625rem] font-semibold tracking-[-0.02em] text-ink">
        House<span className="text-muted">Control</span>
      </span>
    </Link>
  )
}
