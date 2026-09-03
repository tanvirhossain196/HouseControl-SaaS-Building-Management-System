import { pageMetadata } from '@/lib/seo'
import { defaultOrgId, requirePermission } from '@/lib/auth/guards'
import { listOrgResidents } from '@/services/residents.service'
import { PageHeader, EmptyState } from '@/components/layout/page-header'
import { ResidentDirectory } from '@/components/residents/resident-directory'

export const metadata = pageMetadata({
  title: 'Residents',
  description: 'Everyone living in your buildings.',
  path: '/admin/residents',
  noIndex: true,
})

/** The owner's directory: everyone, across every flat, searchable. */
export default async function ResidentsPage() {
  const session = await requirePermission('resident.invite')
  const orgId = defaultOrgId(session)
  const residents = orgId ? await listOrgResidents(orgId).catch(() => []) : []

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
        <ResidentDirectory residents={residents} />
      )}
    </>
  )
}
