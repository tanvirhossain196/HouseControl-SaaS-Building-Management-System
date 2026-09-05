import * as React from 'react'
import { cn } from '@/lib/utils'

/** Scrollable data table shell. Wrap in a labelled region for screen readers. */
export function Table({
  className,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    // `-mx-4` on a phone lets a wide table use the full screen width
    // instead of being squeezed inside the page's padding.
    <div className="-mx-4 w-[calc(100%+2rem)] overflow-x-auto border-y border-line bg-surface sm:mx-0 sm:w-full sm:rounded-panel sm:border">
      <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  )
}

export function THead({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={cn('border-b border-line bg-raised/60', className)} {...props} />
  )
}

export function TBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('divide-y divide-line', className)} {...props} />
}

export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn('transition-colors hover:bg-raised/50', className)} {...props} />
  )
}

export function TH({
  className,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn(
        'whitespace-nowrap px-4 py-3 text-left text-xs font-semibold text-muted',
        className,
      )}
      {...props}
    />
  )
}

export function TD({
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-4 py-3 align-middle text-ink', className)} {...props} />
}
