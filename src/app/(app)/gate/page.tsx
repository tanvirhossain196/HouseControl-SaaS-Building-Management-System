import { pageMetadata } from '@/lib/seo'
import { requirePermission } from '@/lib/auth/guards'
import { getGateOverview } from '@/services/overview.service'
import { PageHeader, EmptyState } from '@/components/layout/page-header'
import { Stat } from '@/components/dashboard/stat'

export const metadata = pageMetadata({
  title: 'Gate',
  description: 'Log who comes in and who leaves.',
  path: '/gate',
  noIndex: true,
})

/**
 * The guard's whole app. Big targets, few words, no money anywhere — the RLS
 * policies would refuse a ledger query from this role regardless.
 */
export default async function GatePage() {
  const session = await requirePermission('visitor.log')
  const orgId = session.memberships.orgs[0]?.orgId ?? null
  const stats = await getGateOverview(orgId)

  return (
    <>
      <PageHeader
        title={stats.buildingName ?? 'Gate'}
        description="Log an entry when someone arrives, and mark them out when they leave."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:max-w-lg">
        <Stat
          label="Inside now"
          value={String(stats.inside)}
          hint="Logged in, not yet out"
        />
        <Stat label="Entries today" value={String(stats.todayEntries)} />
      </div>

      <div className="mt-8">
        <EmptyState
          title="The visitor form lands in Phase 9"
          body="It will be one screen: name, which flat, and a photo if there is one. The resident gets a notification the moment you log it, and pre-approved guests show up here with a code."
        />
      </div>
    </>
  )
}
