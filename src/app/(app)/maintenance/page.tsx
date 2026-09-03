import { pageMetadata } from '@/lib/seo'
import { requireSession } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { listRequests } from '@/services/maintenance.service'
import {
  slaState,
  type MaintenancePriority,
  type MaintenanceStatus,
} from '@/lib/maintenance'
import { PageHeader, EmptyState } from '@/components/layout/page-header'
import { Stat } from '@/components/dashboard/stat'
import { ReportProblem } from '@/components/maintenance/report-problem'
import { RequestList } from '@/components/maintenance/request-list'

export const metadata = pageMetadata({
  title: 'Complaints',
  description: 'Problems reported, and what has been done about them.',
  path: '/maintenance',
  noIndex: true,
})

/**
 * One page, three audiences. RLS decides the rows: a resident sees their own
 * flat's problems, a moderator their flat's, an owner the whole building's.
 */
export default async function MaintenancePage() {
  const session = await requireSession('/maintenance')
  const supabase = createServerSupabase()

  const flatIds = session.memberships.flats.map((flat) => flat.flatId)

  const [{ data: flatRows }, requests] = await Promise.all([
    flatIds.length > 0
      ? supabase
          .from('flats')
          .select('id, unit_number, building_id, buildings(name)')
          .in('id', flatIds)
          .is('archived_at', null)
      : Promise.resolve({ data: [] }),
    listRequests().catch(() => []),
  ])

  // Embedded selects are not expressible in the hand-written Database type.
  const rows = (flatRows ?? []) as unknown as {
    id: string
    unit_number: string
    building_id: string
    buildings: { name: string } | null
  }[]

  const flats = rows.map((flat) => ({
    id: flat.id,
    buildingId: flat.building_id,
    label: `${flat.buildings?.name ?? 'Building'} · ${flat.unit_number}`,
  }))

  const open = requests.filter(
    (request) => request.status === 'open' || request.status === 'in_progress',
  )
  const breached = open.filter(
    (request) =>
      slaState({
        status: request.status as MaintenanceStatus,
        priority: request.priority as MaintenancePriority,
        createdAt: request.created_at,
      }) === 'breached',
  )
  const mine = requests.filter((request) => request.reported_by === session.userId)

  return (
    <>
      <PageHeader
        title="Complaints and repairs"
        description="Everything reported, who is dealing with it, and what was done."
        actions={flats.length > 0 ? <ReportProblem flats={flats} /> : undefined}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Still open"
          value={String(open.length)}
          tone={open.length ? 'due' : 'paid'}
        />
        <Stat
          label="Past their target"
          value={String(breached.length)}
          tone={breached.length ? 'overdue' : 'paid'}
          hint="Urgent in 4h, high in a day, normal in three"
        />
        <Stat label="Reported by you" value={String(mine.length)} />
        <Stat
          label="Resolved"
          value={String(
            requests.filter((request) => request.status === 'resolved').length,
          )}
          tone="paid"
        />
      </div>

      <div className="mt-10">
        {requests.length === 0 ? (
          <EmptyState
            title="Nothing reported"
            body="A leaking tap, a lift that sticks, a light in the stairwell. Each one gets a reference number and a record of what was done about it."
            action={flats.length > 0 ? <ReportProblem flats={flats} /> : undefined}
          />
        ) : (
          <RequestList requests={requests} />
        )}
      </div>
    </>
  )
}
