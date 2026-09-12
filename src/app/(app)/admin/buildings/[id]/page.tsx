import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, LayoutGrid, Pencil, Plus } from 'lucide-react'
import { pageMetadata } from '@/lib/seo'
import { assertPermission } from '@/lib/auth/guards'
import { getBuilding } from '@/services/buildings.service'
import { createServerSupabase } from '@/lib/supabase/server'
import { listFlatsWithCounts } from '@/services/flats.service'
import { listBuildingRemittances } from '@/services/remittances.service'
import { formatTaka } from '@/lib/utils'
import { PageHeader, EmptyState } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Stat } from '@/components/dashboard/stat'
import { BillMonth } from '@/components/money/bill-month'
import { CloseBuildingButton } from '@/components/property/close-building-button'
import { HandoverSchedule } from '@/components/money/handover-schedule'
import { BuildingForm } from '@/components/property/building-form'
import { FlatForm } from '@/components/property/flat-form'
import { BulkFlatsForm } from '@/components/property/bulk-flats-form'
import { UnitGrid } from '@/components/property/unit-grid'
import { FlatTable } from '@/components/property/flat-table'

export const metadata = pageMetadata({
  title: 'Building',
  description: 'Floors, units and rents for one building.',
  path: '/admin/buildings',
  noIndex: true,
})

export default async function BuildingPage({ params }: { params: { id: string } }) {
  const building = await getBuilding(params.id).catch(() => null)
  if (!building) notFound()

  // Permission is scoped to this building's organization, not "anywhere".
  await assertPermission('building.edit', { orgId: building.org_id })

  /**
   * Other live buildings in the same organization.
   *
   * Offered as somewhere to move residents before this one is closed. Excludes
   * itself, since moving people into the building being shut is not a plan.
   */
  const { data: siblings } = await createServerSupabase()
    .from('buildings')
    .select('id, name')
    .eq('org_id', building.org_id)
    .is('archived_at', null)
    .neq('id', building.id)
    .order('name')

  const moveTargets = siblings ?? []

  const [flats, handovers] = await Promise.all([
    listFlatsWithCounts(building.id).catch(() => []),
    listBuildingRemittances(building.id).catch(() => []),
  ])

  const occupied = flats.filter((flat) => flat.occupancy_status === 'occupied').length
  const monthlyRent = flats
    .filter((flat) => flat.occupancy_status === 'occupied')
    .reduce((sum, flat) => sum + Number(flat.monthly_rent), 0)
  const outstanding = flats.reduce((sum, flat) => sum + flat.outstanding, 0)

  return (
    <>
      <Link
        href="/admin"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
      >
        <ChevronLeft className="size-4" /> Buildings
      </Link>

      <PageHeader
        title={building.name}
        description={`${building.address_line}${building.area ? `, ${building.area}` : ''}, ${building.city} · ${building.floors_count} floors`}
        actions={
          <>
            <BuildingForm
              orgId={building.org_id}
              building={building}
              trigger={
                <Button variant="outline">
                  <Pencil /> Edit building
                </Button>
              }
            />
            <BillMonth scope="building" id={building.id} label={building.name} />

            <CloseBuildingButton
              buildingId={building.id}
              buildingName={building.name}
              moveTargets={moveTargets}
            />
            <BulkFlatsForm
              buildingId={building.id}
              floorsCount={building.floors_count}
              trigger={
                <Button variant="outline">
                  <LayoutGrid /> Generate units
                </Button>
              }
            />
            <FlatForm
              buildingId={building.id}
              trigger={
                <Button>
                  <Plus /> Add flat
                </Button>
              }
            />
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Units" value={String(flats.length)} hint={`${occupied} occupied`} />
        <Stat
          label="Rent under contract"
          value={formatTaka(monthlyRent)}
          hint="Occupied units, per month"
        />
        <Stat
          label="Outstanding"
          value={formatTaka(outstanding)}
          tone={outstanding > 0 ? 'due' : 'paid'}
        />
        <Stat
          label="Vacant"
          value={String(
            flats.filter((flat) => flat.occupancy_status === 'vacant').length,
          )}
          hint="Available to rent"
        />
      </div>

      {flats.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            title="No units yet"
            body="Generate the whole building at once — pick the floor range and how many units each floor has, check the preview, and create them. You can edit rents individually afterwards."
            action={
              <BulkFlatsForm
                buildingId={building.id}
                floorsCount={building.floors_count}
                trigger={
                  <Button>
                    <LayoutGrid /> Generate units
                  </Button>
                }
              />
            }
          />
        </div>
      ) : (
        <>
          <section className="mt-10">
            <h2 className="text-title text-ink">The building</h2>
            <p className="mt-1 text-sm text-muted">
              Top floor first. Select a unit to see its details.
            </p>
            <div className="mt-4">
              <UnitGrid flats={flats} />
            </div>
          </section>

          <section className="mt-10">
            <h2 className="text-title text-ink">Handover schedule</h2>
            <p className="mt-1 max-w-[62ch] text-sm leading-relaxed text-muted">
              What each moderator owes you for the flats they cover, and the date you
              expect it by. Change a date here rather than re-billing the month — billing
              again would raise nothing new.
            </p>
            <div className="mt-4">
              <HandoverSchedule rows={handovers} buildingId={building.id} />
            </div>
          </section>

          <section className="mt-10">
            <h2 className="text-title text-ink">Units</h2>
            <div className="mt-4">
              <FlatTable flats={flats} buildingId={building.id} />
            </div>
          </section>
        </>
      )}

      {building.notes && (
        <section className="mt-10 max-w-[62ch]">
          <h2 className="text-title text-ink">Notes</h2>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted">
            {building.notes}
          </p>
        </section>
      )}
    </>
  )
}
