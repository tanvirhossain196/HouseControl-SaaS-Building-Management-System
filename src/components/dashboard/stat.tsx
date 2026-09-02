import { cn } from '@/lib/utils'

/** One number with its label. The number is the point, so it leads. */
export function Stat({
  label,
  value,
  hint,
  tone = 'neutral',
  className,
}: {
  label: string
  value: string
  hint?: string
  tone?: 'neutral' | 'paid' | 'due' | 'overdue'
  className?: string
}) {
  return (
    <div className={cn('rounded-panel border border-line bg-surface p-5', className)}>
      <p className="text-sm text-muted">{label}</p>
      <p
        className={cn(
          'tabular mt-2 font-mono text-[1.75rem] font-semibold leading-none tracking-tight',
          tone === 'neutral' && 'text-ink',
          tone === 'paid' && 'text-paid',
          tone === 'due' && 'text-due',
          tone === 'overdue' && 'text-overdue',
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-2 text-xs leading-relaxed text-muted">{hint}</p>}
    </div>
  )
}

/** Collection progress. Reads as a proportion, not a percentage badge. */
export function CollectionMeter({
  collected,
  billed,
  label = 'Collected this month',
}: {
  collected: number
  billed: number
  label?: string
}) {
  const pct = billed > 0 ? Math.round((collected / billed) * 100) : 0

  return (
    <div className="rounded-panel border border-line bg-surface p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-muted">{label}</p>
        <p className="tabular font-mono text-sm text-muted">{pct}%</p>
      </div>
      <div
        className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-raised"
        role="img"
        aria-label={`${pct} percent collected`}
      >
        <div
          className="h-full origin-left animate-meter-fill rounded-full bg-paid"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
