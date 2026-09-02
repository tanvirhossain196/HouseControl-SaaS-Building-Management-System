import { cn } from '@/lib/utils'

/** Title, one line of context, and the actions for this screen. */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 pb-8 sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
    >
      <div>
        <h1 className="text-display text-ink">{title}</h1>
        {description && <p className="mt-2 max-w-[62ch] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

/** For a screen that exists but has nothing in it yet. */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: React.ReactNode
}) {
  return (
    <div className="rounded-panel border border-dashed border-line p-12 text-center">
      <p className="font-medium text-ink">{title}</p>
      <p className="mx-auto mt-2 max-w-[52ch] text-sm leading-relaxed text-muted">
        {body}
      </p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  )
}
