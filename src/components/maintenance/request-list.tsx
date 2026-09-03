'use client'

import * as React from 'react'
import Link from 'next/link'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { Badge } from '@/components/ui/badge'
import { Input, Select } from '@/components/ui/input'
import { EmptyState } from '@/components/layout/page-header'
import {
  ageOf,
  PRIORITY_LABELS,
  slaState,
  STATUS_LABELS,
  type MaintenancePriority,
  type MaintenanceStatus,
} from '@/lib/maintenance'
import type { MaintenanceWithContext } from '@/services/maintenance.service'

const statusTone: Record<MaintenanceStatus, 'due' | 'paid' | 'neutral' | 'primary'> = {
  open: 'due',
  in_progress: 'primary',
  resolved: 'paid',
  cancelled: 'neutral',
}

const priorityTone: Record<MaintenancePriority, 'overdue' | 'due' | 'neutral'> = {
  urgent: 'overdue',
  high: 'due',
  normal: 'neutral',
  low: 'neutral',
}

/** Already ordered by the server; this only filters. */
export function RequestList({ requests }: { requests: MaintenanceWithContext[] }) {
  const [search, setSearch] = React.useState('')
  const [status, setStatus] = React.useState<'all' | 'open' | MaintenanceStatus>('open')
  const query = useDebouncedValue(search, 200).trim().toLowerCase()

  const rows = requests.filter((request) => {
    if (
      status === 'open' &&
      (request.status === 'resolved' || request.status === 'cancelled')
    ) {
      return false
    }
    if (status !== 'all' && status !== 'open' && request.status !== status) return false
    if (!query) return true
    return (
      request.title.toLowerCase().includes(query) ||
      request.reference.toLowerCase().includes(query) ||
      (request.unitNumber ?? '').toLowerCase().includes(query) ||
      (request.reporterName ?? '').toLowerCase().includes(query)
    )
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search MR-0007, lift, 5B…"
          aria-label="Search requests"
          className="max-w-xs"
        />
        <Select
          value={status}
          onChange={(event) => setStatus(event.target.value as typeof status)}
          aria-label="Filter by status"
          className="max-w-[12rem]"
        >
          <option value="open">Still open</option>
          <option value="all">Everything</option>
          <option value="in_progress">Being fixed</option>
          <option value="resolved">Resolved</option>
          <option value="cancelled">Cancelled</option>
        </Select>
        <p className="tabular self-center font-mono text-xs text-muted">
          {rows.length} of {requests.length}
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing here"
          body="Either everything is fixed, or the filter is hiding it. Try 'Everything'."
        />
      ) : (
        <ul className="divide-y divide-line rounded-panel border border-line bg-surface">
          {rows.map((request) => {
            const sla = slaState({
              status: request.status as MaintenanceStatus,
              priority: request.priority as MaintenancePriority,
              createdAt: request.created_at,
            })

            return (
              <li key={request.id}>
                <Link
                  href={`/maintenance/${request.id}`}
                  className="flex flex-wrap items-center gap-3 p-4 transition-colors hover:bg-raised/50"
                >
                  <span className="tabular w-20 shrink-0 font-mono text-xs text-muted">
                    {request.reference}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-ink">{request.title}</span>
                    <span className="mt-0.5 block text-sm text-muted">
                      {request.unitNumber ? `Flat ${request.unitNumber}` : 'Building'} ·{' '}
                      {request.reporterName ?? 'someone'} · {ageOf(request.created_at)}
                      {request.reopened_count > 0 &&
                        ` · reopened ${request.reopened_count}×`}
                    </span>
                  </span>

                  <span className="flex shrink-0 items-center gap-2">
                    {sla === 'breached' && (
                      <Badge tone="overdue" dot>
                        Past target
                      </Badge>
                    )}
                    {sla === 'due_soon' && <Badge tone="due">Due soon</Badge>}
                    <Badge tone={priorityTone[request.priority as MaintenancePriority]}>
                      {PRIORITY_LABELS[request.priority as MaintenancePriority]}
                    </Badge>
                    <Badge tone={statusTone[request.status as MaintenanceStatus]} dot>
                      {STATUS_LABELS[request.status as MaintenanceStatus]}
                    </Badge>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
