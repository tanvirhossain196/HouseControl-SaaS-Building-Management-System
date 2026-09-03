import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/layout/page-header'
import { KIND_LABELS, durationSince } from '@/lib/gate'
import type { VisitorWithContext } from '@/services/visitors.service'
import type { VisitorState } from '@/types'

const stateTone: Record<VisitorState, 'paid' | 'due' | 'neutral' | 'overdue'> = {
  inside: 'due',
  exited: 'neutral',
  pre_approved: 'paid',
  denied: 'overdue',
}

const stateLabel: Record<VisitorState, string> = {
  inside: 'Inside',
  exited: 'Left',
  pre_approved: 'Expected',
  denied: 'Turned away',
}

/** The register, newest first. Read-only — actions live on the gate console. */
export function VisitLog({ visits }: { visits: VisitorWithContext[] }) {
  if (visits.length === 0) {
    return (
      <EmptyState
        title="Nothing logged yet"
        body="Every arrival and exit is recorded here with the time, who logged it, and which flat it was for."
      />
    )
  }

  return (
    <ul className="divide-y divide-line rounded-panel border border-line bg-surface">
      {visits.map((visit) => (
        <li key={visit.id} className="flex flex-wrap items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-ink">{visit.full_name}</p>
            <p className="mt-0.5 text-sm text-muted">
              {KIND_LABELS[visit.kind]}
              {visit.unitNumber ? ` · flat ${visit.unitNumber}` : ' · building'}
              {visit.purpose ? ` · ${visit.purpose}` : ''}
            </p>
            {visit.phone && (
              <p className="tabular mt-0.5 font-mono text-xs text-muted">{visit.phone}</p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <span className="tabular text-right font-mono text-xs text-muted">
              {visit.entered_at ? (
                <>
                  <span className="block">{visit.entered_at.slice(11, 16)}</span>
                  <span className="block">
                    {visit.exited_at
                      ? `out ${visit.exited_at.slice(11, 16)}`
                      : durationSince(visit.entered_at)}
                  </span>
                </>
              ) : (
                'not arrived'
              )}
            </span>
            <Badge tone={stateTone[visit.state]} dot>
              {stateLabel[visit.state]}
            </Badge>
          </div>
        </li>
      ))}
    </ul>
  )
}
