import { pageMetadata } from '@/lib/seo'
import { defaultOrgId, requirePermission } from '@/lib/auth/guards'

import { listOrgResidents } from '@/services/residents.service'
import { listReviewScope } from '@/lib/auth/reviewable'

import { EmptyState, PageHeader } from '@/components/layout/page-header'

import { ResidentDirectory } from '@/components/residents/resident-directory'

export const metadata = pageMetadata({
  title: 'Residents',
  description: 'Everyone living in your buildings.',
  path: '/admin/residents',
  noIndex: true,
})

/**
 * Owner directory:
 * everyone across the organization, with management actions.
 */
export default async function ResidentsPage() {
  const session = await requirePermission('resident.remove')

  const orgId = defaultOrgId(session)

  const residents = orgId ? await listOrgResidents(orgId).catch(() => []) : []

  /**
   * Flats somebody could be moved into.
   *
   * The same scope the payment queues use. Each row filters out its own flat,
   * so the list is built once here rather than per resident.
   */
  const transferTargets = (await listReviewScope(session).catch(() => [])).flatMap(
    (building) =>
      building.flats.map((flat) => ({
        id: flat.id,
        label: `${building.name} · Flat ${flat.unitNumber}`,
      })),
  )

  return (
    <>
      <PageHeader
        title="Residents"
        description="Everyone living in your buildings, with the share of rent each one carries."
      />

      {residents.length === 0 ? (
        <EmptyState
          title="No residents yet"
          body="Invite a flat moderator and they will bring in the people sharing their flat."
        />
      ) : (
        <ResidentDirectory residents={residents} transferTargets={transferTargets} />
      )}
    </>
  )
}
