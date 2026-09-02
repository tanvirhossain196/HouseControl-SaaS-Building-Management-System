import Link from 'next/link'
import { Plus } from 'lucide-react'
import { pageMetadata } from '@/lib/seo'
import { defaultOrgId, requirePermission } from '@/lib/auth/guards'
import { listBuildingsWithCounts } from '@/services/buildings.service'
import { PageHeader, EmptyState } from '@/components/layout/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { BuildingForm } from '@/components/property/building-form'

export const metadata = pageMetadata({
  title: 'Buildings',
  description: 'The buildings in your organization.',
  path: '/admin',
  noIndex: true,
})

export default async function AdminBuildingsPage() {
  const session = await requirePermission('building.edit')
  const orgId = defaultOrgId(session)
  const buildings = orgId ? await listBuildingsWithCounts(orgId).catch(() => []) : []

  return (
    <>
      <PageHeader
        title="Buildings"
        description="Each building holds its own floors, units and rents."
        actions={
          <>
            <Link href="/admin/flats" className={buttonVariants({ variant: 'outline' })}>
              All flats
            </Link>
            {orgId && (
              <BuildingForm
                orgId={orgId}
                trigger={
                  <Button>
                    <Plus /> Add building
                  </Button>
                }
              />
            )}
          </>
        }
      />

      {buildings.length === 0 ? (
        <EmptyState
          title="No buildings yet"
          body="Add the building first, then generate its units in one go. A six-storey walk-up takes about ten minutes."
          action={
            orgId ? (
              <BuildingForm
                orgId={orgId}
                trigger={
                  <Button>
                    <Plus /> Add your first building
                  </Button>
                }
              />
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {buildings.map((building) => (
            <Link
              key={building.id}
              href={`/admin/buildings/${building.id}`}
              className="rounded-panel focus-visible:outline-none"
            >
              <Card interactive className="h-full">
                <CardContent className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold text-ink">{building.name}</p>
                    <Badge tone="neutral">{building.floors_count} floors</Badge>
                  </div>
                  <p className="text-sm text-muted">
                    {building.address_line}
                    {building.area ? `, ${building.area}` : ''}, {building.city}
                  </p>
                  <div className="flex gap-4 border-t border-line pt-3">
                    <span className="text-xs text-muted">
                      <span className="tabular block font-mono text-base text-ink">
                        {building.units}
                      </span>
                      units
                    </span>
                    <span className="text-xs text-muted">
                      <span className="tabular block font-mono text-base text-paid">
                        {building.occupied}
                      </span>
                      occupied
                    </span>
                    <span className="text-xs text-muted">
                      <span className="tabular block font-mono text-base text-ink">
                        {building.vacant}
                      </span>
                      vacant
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
