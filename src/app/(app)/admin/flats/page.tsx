import { pageMetadata } from '@/lib/seo'
import { defaultOrgId, requirePermission } from '@/lib/auth/guards'
import { listBuildings } from '@/services/buildings.service'
import { listFlatsWithCounts } from '@/services/flats.service'
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
  const buildings = orgId ? await listBuildings(orgId).catch(() => []) : []

  const perBuilding = await Promise.all(
    buildings.map(async (building) => {
      const flats = await listFlatsWithCounts(building.id).catch(() => [])
      return flats.map((flat) => ({ ...flat, buildingName: building.name }))
    }),
  )

  const flats = perBuilding.flat()

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
