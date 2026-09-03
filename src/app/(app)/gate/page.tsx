import { pageMetadata } from '@/lib/seo'
import { requirePermission } from '@/lib/auth/guards'
import { createServerSupabase } from '@/lib/supabase/server'
import {
  listBlocked,
  listExpected,
  listInside,
  listRecentVisits,
} from '@/services/visitors.service'
import { PageHeader, EmptyState } from '@/components/layout/page-header'
import { GateConsole } from '@/components/gate/gate-console'
import { VisitLog } from '@/components/gate/visit-log'
import { Tabs } from '@/components/ui/tabs'

export const metadata = pageMetadata({
  title: 'Gate',
  description: 'Log who comes in and who leaves.',
  path: '/gate',
  noIndex: true,
})

/**
 * The guard's whole app.
 *
 * Big targets, few words, and no money anywhere — the RLS policies would
 * refuse a ledger query from this role regardless. It is built for one thumb
 * on a mid-range Android phone at the gate, so the two things that happen
 * fifty times a day (log an arrival, mark someone out) are the two things
 * reachable without scrolling.
 */
export default async function GatePage() {
  const session = await requirePermission('visitor.log')
  const supabase = createServerSupabase()

  const orgIds = session.memberships.orgs.map((org) => org.orgId)

  const { data: building } = await supabase
    .from('buildings')
    .select('id, name')
    .in('org_id', orgIds.length ? orgIds : ['00000000-0000-0000-0000-000000000000'])
    .is('archived_at', null)
    .order('name')
    .limit(1)
    .maybeSingle()

  if (!building) {
    return (
      <>
        <PageHeader title="Gate" />
        <EmptyState
          title="No building assigned"
          body="Ask the building owner to add you to their organization as a guard. The gate screen appears here once they do."
        />
      </>
    )
  }

  const [{ data: flatRows }, inside, expected, recent, blocked] = await Promise.all([
    supabase
      .from('flats')
      .select('id, unit_number, floor')
      .eq('building_id', building.id)
      .is('archived_at', null)
      .order('unit_number'),
    listInside(building.id).catch(() => []),
    listExpected(building.id).catch(() => []),
    listRecentVisits(building.id, 50).catch(() => []),
    listBlocked(building.id).catch(() => []),
  ])

  const flats = (flatRows ?? []).map((flat) => ({
    id: flat.id,
    unitNumber: flat.unit_number,
  }))

  return (
    <>
      <PageHeader
        title={building.name}
        description={`${inside.length} inside now · ${expected.length} expected today`}
      />

      <GateConsole
        buildingId={building.id}
        flats={flats}
        inside={inside}
        expected={expected}
      />

      <div className="mt-10">
        <Tabs
          items={[
            {
              id: 'today',
              label: 'Recent',
              content: <VisitLog visits={recent} />,
            },
            {
              id: 'blocked',
              label: `Not admitted${blocked.length ? ` (${blocked.length})` : ''}`,
              content:
                blocked.length === 0 ? (
                  <EmptyState
                    title="Nobody is blocked"
                    body="When the owner blocks someone, they appear here and the entry form refuses their number."
                  />
                ) : (
                  <ul className="divide-y divide-line rounded-panel border border-line bg-surface">
                    {blocked.map((block) => (
                      <li key={block.id} className="p-4">
                        <p className="font-medium text-ink">{block.full_name}</p>
                        <p className="tabular font-mono text-xs text-muted">
                          {block.phone ?? 'no number on file'}
                        </p>
                        <p className="mt-1 max-w-[60ch] text-sm text-muted">
                          {block.reason}
                        </p>
                      </li>
                    ))}
                  </ul>
                ),
            },
          ]}
        />
      </div>
    </>
  )
}
