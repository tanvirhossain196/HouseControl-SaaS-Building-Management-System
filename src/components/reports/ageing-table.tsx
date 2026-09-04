import { AGEING_LABELS, type Ageing, type AgeingBucket } from '@/lib/reports'
import { formatTaka } from '@/lib/utils'
import { EmptyState } from '@/components/layout/page-header'

const ORDER: AgeingBucket[] = ['current', '1_30', '31_60', '61_90', 'over_90']

const tone: Record<AgeingBucket, string> = {
  current: 'bg-line',
  '1_30': 'bg-due',
  '31_60': 'bg-due',
  '61_90': 'bg-overdue/70',
  over_90: 'bg-overdue',
}

/**
 * How old the money is.
 *
 * The total is what an owner already knows; the shape is what they do not.
 * Two lakh spread across this month is a collection problem, and the same
 * two lakh sitting past ninety days is a legal one.
 */
export function AgeingTable({ ageing }: { ageing: Ageing }) {
  if (ageing.total <= 0) {
    return <EmptyState title="Nothing outstanding" body="Every charge is settled." />
  }

  return (
    <div className="rounded-panel border border-line bg-surface p-5">
      <div className="flex h-2 overflow-hidden rounded-full bg-raised">
        {ORDER.map((bucket) =>
          ageing[bucket] > 0 ? (
            <span
              key={bucket}
              className={tone[bucket]}
              style={{ width: `${(ageing[bucket] / ageing.total) * 100}%` }}
              title={`${AGEING_LABELS[bucket]}: ${formatTaka(ageing[bucket])}`}
            />
          ) : null,
        )}
      </div>

      <dl className="mt-5 space-y-2.5">
        {ORDER.map((bucket) => (
          <div key={bucket} className="flex items-center justify-between gap-4 text-sm">
            <dt className="flex items-center gap-2 text-muted">
              <span aria-hidden className={`size-2 rounded-full ${tone[bucket]}`} />
              {AGEING_LABELS[bucket]}
            </dt>
            <dd
              className={
                bucket === 'over_90' && ageing[bucket] > 0
                  ? 'tabular font-mono text-overdue'
                  : 'tabular font-mono text-ink'
              }
            >
              {formatTaka(ageing[bucket])}
            </dd>
          </div>
        ))}
        <div className="flex items-center justify-between gap-4 border-t border-line pt-2.5 text-sm">
          <dt className="font-medium text-ink">Total outstanding</dt>
          <dd className="tabular font-mono font-semibold text-ink">
            {formatTaka(ageing.total)}
          </dd>
        </div>
      </dl>
    </div>
  )
}
