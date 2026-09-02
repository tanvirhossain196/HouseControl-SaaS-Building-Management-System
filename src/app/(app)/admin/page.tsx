import Link from 'next/link'
import { pageMetadata } from '@/lib/seo'
import { requirePermission, defaultOrgId } from '@/lib/auth/guards'
import { listBuildings } from '@/services/buildings.service'
import { PageHeader, EmptyState } from '@/components/layout/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Can } from '@/components/providers/permission-provider'

export const metadata = pageMetadata({
  title: 'Buildings',
  description: 'The buildings in your organization.',
  path: '/admin',
  noIndex: true,
})

/**
 * Owner-only. `requirePermission` redirects a moderator or resident who
 * follows a shared link to /forbidden before any query runs.
 */
export default async function AdminBuildingsPage() {
  const session = await requirePermission('building.edit')
  const orgId = defaultOrgId(session)
  const buildings = orgId ? await listBuildings(orgId).catch(() => []) : []

  return (
    <>
      <PageHeader
        title="Buildings"
        description="Add a building, then its floors and flats. Phase 5 turns these cards into full building pages."
        actions={
          <Can permission="building.create">
            <Link href="/admin/team" className={buttonVariants({ variant: 'outline' })}>
              Invite people
            </Link>
          </Can>
        }
      />

      {buildings.length === 0 ? (
        <EmptyState
          title="No buildings yet"
          body="Adding a building takes about ten minutes for a six-storey walk-up: floors, units, rent per unit and the day rent is due."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {buildings.map((building) => (
            <Card key={building.id} interactive>
              <CardContent className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-ink">{building.name}</p>
                  <Badge tone="neutral">{building.floors_count} floors</Badge>
                </div>
                <p className="text-sm text-muted">
                  {building.address_line}
                  {building.area ? `, ${building.area}` : ''}, {building.city}
                </p>
                {building.amenities.length > 0 && (
                  <p className="text-xs text-muted">{building.amenities.join(' · ')}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
