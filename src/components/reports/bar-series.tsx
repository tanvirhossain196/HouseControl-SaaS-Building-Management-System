import { formatTaka } from '@/lib/utils'
import { periodLabel } from '@/lib/billing'
import { collectionRate } from '@/lib/reports'
import type { MonthlyPoint } from '@/lib/reports'

/**
 * Twelve months of billing and collection, as two bars a month.
 *
 * Drawn with divs rather than a charting library: the shape is one number
 * against another over twelve points, and shipping a chart bundle for that
 * costs more than it explains. It also means the whole thing renders on the
 * server with no JavaScript.
 */
export function BarSeries({ points }: { points: MonthlyPoint[] }) {
  const ceiling = Math.max(...points.map((point) => point.billed), 1)

  return (
    <div className="rounded-panel border border-line bg-surface p-5">
      <div
        className="flex items-end gap-2 overflow-x-auto pb-2"
        style={{ height: '11rem' }}
      >
        {points.map((point) => {
          const billedHeight = Math.max(2, (point.billed / ceiling) * 100)
          const collectedHeight = Math.max(
            point.collected > 0 ? 2 : 0,
            (point.collected / ceiling) * 100,
          )
          const rate = collectionRate(point.billed, point.collected)

          return (
            <div
              key={point.period}
              className="flex min-w-10 flex-1 flex-col items-center justify-end gap-2"
            >
              <div
                className="relative flex w-full items-end justify-center"
                style={{ height: '8.5rem' }}
                title={`${periodLabel(point.period)} — ${formatTaka(point.collected)} of ${formatTaka(point.billed)} (${rate}%)`}
              >
                <div
                  className="w-full rounded-t-tile bg-raised"
                  style={{ height: `${billedHeight}%` }}
                />
                <div
                  className="absolute bottom-0 w-full rounded-t-tile bg-paid"
                  style={{ height: `${collectedHeight}%` }}
                />
              </div>
              <span className="tabular font-mono text-[0.65rem] text-muted">
                {point.period.slice(2, 7)}
              </span>
            </div>
          )
        })}
      </div>

      <ul className="mt-3 flex gap-4 border-t border-line pt-3">
        <li className="flex items-center gap-1.5 text-xs text-muted">
          <span aria-hidden className="size-2 rounded-full bg-paid" />
          Collected
        </li>
        <li className="flex items-center gap-1.5 text-xs text-muted">
          <span aria-hidden className="size-2 rounded-full bg-raised" />
          Billed
        </li>
      </ul>
    </div>
  )
}
