import { pageMetadata } from '@/lib/seo'
import { defaultOrgId, requirePermission } from '@/lib/auth/guards'
import { listOrgFlatsWithCounts } from '@/services/flats.service'
import { PageHeader, EmptyState } from '@/components/layout/page-header'
import { FlatTable } from '@/components/property/flat-table'

export const metadata = pageMetadata({
  title: 'Flats',
  description: 'Every flat across your buildings.',
  path: '/admin/flats',
  noIndex: true,
})

/** Every unit the organization owns, in one searchable table. */
export default async function AllFlatsPage() {
  const session = await requirePermission('flat.edit')
  const orgId = defaultOrgId(session)
  // One pass for the whole organization: three queries per building would
  // mean eighteen round trips for an owner with six of them.
  const flats = orgId ? await listOrgFlatsWithCounts(orgId).catch(() => []) : []

  return (
    <>
      <PageHeader
        title="Flats"
        description="Every unit across your buildings. Search by unit number, moderator or building."
      />

      {flats.length === 0 ? (
        <EmptyState
          title="No flats yet"
          body="Open a building and generate its units — they all appear here once they exist."
        />
      ) : (
        <FlatTable flats={flats} showBuilding />
      )}
    </>
  )
}
