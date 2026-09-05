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
        'flex flex-col gap-4 pb-6 sm:pb-8 md:flex-row md:items-start md:justify-between',
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-display text-ink">{title}</h1>
        {description && (
          <p className="mt-2 max-w-[62ch] text-sm text-muted sm:text-base">
            {description}
          </p>
        )}
      </div>

      {/*
        On a phone the buttons stack under the title and fill the row, which
        is both easier to hit and stops a long label pushing the layout wider
        than the screen. `[&>*]:flex-1` reaches the links inside, which are
        anchors rather than buttons and cannot be styled from here otherwise.
      */}
      {actions && (
        <div className="flex flex-wrap gap-2 md:shrink-0 [&>*]:flex-1 sm:[&>*]:flex-none">
          {actions}
        </div>
      )}
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
    <div className="rounded-panel border border-dashed border-line p-8 text-center sm:p-12">
      <p className="font-medium text-ink">{title}</p>
      <p className="mx-auto mt-2 max-w-[52ch] text-sm leading-relaxed text-muted">
        {body}
      </p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  )
}
