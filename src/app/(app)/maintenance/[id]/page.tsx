import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { pageMetadata } from '@/lib/seo'
import { requireSession } from '@/lib/auth/session'
import { sessionCan } from '@/lib/auth/guards'
import { getBuilding } from '@/services/buildings.service'
import { getRequest, listAssignees, listTimeline } from '@/services/maintenance.service'
import {
  ageOf,
  PRIORITY_LABELS,
  responseDueAt,
  slaState,
  STATUS_LABELS,
  type MaintenancePriority,
  type MaintenanceStatus,
} from '@/lib/maintenance'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { RequestDetail } from '@/components/maintenance/request-detail'

export const metadata = pageMetadata({
  title: 'Request',
  description: 'One reported problem and what has been done about it.',
  path: '/maintenance',
  noIndex: true,
})

export default async function RequestPage({ params }: { params: { id: string } }) {
  const session = await requireSession()
  const request = await getRequest(params.id).catch(() => null)
  if (!request) notFound()

  const building = await getBuilding(request.building_id).catch(() => null)
  const scope = { orgId: building?.org_id, flatId: request.flat_id ?? undefined }

  const [timeline, assignees] = await Promise.all([
    listTimeline(request.id).catch(() => []),
    sessionCan(session, 'maintenance.assign', scope)
      ? listAssignees(request.building_id).catch(() => [])
      : Promise.resolve([]),
  ])

  const sla = slaState({
    status: request.status as MaintenanceStatus,
    priority: request.priority as MaintenancePriority,
    createdAt: request.created_at,
  })

  return (
    <>
      <Link
        href="/maintenance"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
      >
        <ChevronLeft className="size-4" /> Complaints
      </Link>

      <PageHeader
        title={request.title}
        description={`${request.reference} · ${request.unitNumber ? `flat ${request.unitNumber}` : 'building'} · reported by ${request.reporterName ?? 'someone'} ${ageOf(request.created_at)}`}
      />

      <div className="flex flex-wrap gap-2">
        <Badge tone={request.status === 'resolved' ? 'paid' : 'due'} dot>
          {STATUS_LABELS[request.status as MaintenanceStatus]}
        </Badge>
        <Badge tone={request.priority === 'urgent' ? 'overdue' : 'neutral'}>
          {PRIORITY_LABELS[request.priority as MaintenancePriority]}
        </Badge>
        {sla === 'breached' && (
          <Badge tone="overdue" dot>
            Past target
          </Badge>
        )}
        {sla !== 'closed' && (
          <Badge tone="neutral">
            Target{' '}
            {responseDueAt(
              request.priority as MaintenancePriority,
              request.created_at,
            ).slice(0, 10)}
          </Badge>
        )}
        {request.assigneeName && <Badge tone="primary">{request.assigneeName}</Badge>}
      </div>

      <p className="mt-6 max-w-[68ch] whitespace-pre-line leading-relaxed text-muted">
        {request.description}
      </p>

      {request.resolution && (
        <div className="mt-6 max-w-[68ch] rounded-panel border border-paid/30 bg-paid-soft p-4">
          <p className="text-sm font-medium text-ink">What was done</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">{request.resolution}</p>
        </div>
      )}

      <div className="mt-8">
        <RequestDetail
          request={request}
          timeline={timeline}
          assignees={assignees}
          canManage={sessionCan(session, 'maintenance.assign', scope)}
          isReporter={request.reported_by === session.userId}
        />
      </div>
    </>
  )
}
