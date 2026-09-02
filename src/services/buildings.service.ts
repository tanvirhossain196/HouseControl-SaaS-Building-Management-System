import 'server-only'

import { createServerSupabase } from '@/lib/supabase/server'
import { AppError, forbidden, notFound, toAppError } from '@/lib/errors'
import { writeAuditLog } from './audit.service'
import type { CreateBuildingInput } from '@/lib/validation/property'
import type { BuildingRow } from '@/types'

/**
 * Buildings.
 *
 * Services own all database access. Route handlers and server actions call
 * these; components never query Supabase directly. Every read runs as the
 * signed-in user, so RLS is the second lock behind these checks.
 */

export async function listBuildings(orgId: string): Promise<BuildingRow[]> {
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('buildings')
    .select('*')
    .eq('org_id', orgId)
    .is('archived_at', null)
    .order('name')

  if (error) throw toAppError(error)
  return data
}

export async function getBuilding(buildingId: string): Promise<BuildingRow> {
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('buildings')
    .select('*')
    .eq('id', buildingId)
    .maybeSingle()

  if (error) throw toAppError(error)
  if (!data) throw notFound('That building')
  return data
}

export async function createBuilding(
  userId: string,
  input: CreateBuildingInput,
): Promise<BuildingRow> {
  const supabase = createServerSupabase()

  await assertBuildingQuotaAvailable(input.orgId)

  const { data, error } = await supabase
    .from('buildings')
    .insert({
      org_id: input.orgId,
      name: input.name,
      address_line: input.addressLine,
      area: input.area ?? null,
      city: input.city,
      postcode: input.postcode ?? null,
      floors_count: input.floorsCount,
      amenities: input.amenities,
      photo_url: input.photoUrl ?? null,
      notes: input.notes ?? null,
      created_by: userId,
    })
    .select('*')
    .single()

  if (error) throw toAppError(error)

  await writeAuditLog({
    orgId: input.orgId,
    actorId: userId,
    action: 'building.created',
    entityType: 'building',
    entityId: data.id,
    after: { name: data.name, address: data.address_line },
  })

  return data
}

export async function updateBuilding(
  userId: string,
  buildingId: string,
  input: Partial<Omit<CreateBuildingInput, 'orgId'>>,
): Promise<BuildingRow> {
  const supabase = createServerSupabase()
  const before = await getBuilding(buildingId)

  const { data, error } = await supabase
    .from('buildings')
    .update({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.addressLine !== undefined && { address_line: input.addressLine }),
      ...(input.area !== undefined && { area: input.area }),
      ...(input.city !== undefined && { city: input.city }),
      ...(input.postcode !== undefined && { postcode: input.postcode }),
      ...(input.floorsCount !== undefined && { floors_count: input.floorsCount }),
      ...(input.amenities !== undefined && { amenities: input.amenities }),
      ...(input.photoUrl !== undefined && { photo_url: input.photoUrl }),
      ...(input.notes !== undefined && { notes: input.notes }),
    })
    .eq('id', buildingId)
    .select('*')
    .single()

  if (error) throw toAppError(error)

  await writeAuditLog({
    orgId: before.org_id,
    actorId: userId,
    action: 'building.updated',
    entityType: 'building',
    entityId: buildingId,
    before: { name: before.name, address: before.address_line },
    after: { name: data.name, address: data.address_line },
  })

  return data
}

/** Buildings with the counts the list screen shows, in one round trip each. */
export async function listBuildingsWithCounts(orgId: string) {
  const supabase = createServerSupabase()
  const buildings = await listBuildings(orgId)
  if (buildings.length === 0) return []

  const { data: flats } = await supabase
    .from('flats')
    .select('id, building_id, occupancy_status')
    .in(
      'building_id',
      buildings.map((building) => building.id),
    )
    .is('archived_at', null)

  return buildings.map((building) => {
    const units = (flats ?? []).filter((flat) => flat.building_id === building.id)
    return {
      ...building,
      units: units.length,
      occupied: units.filter((flat) => flat.occupancy_status === 'occupied').length,
      vacant: units.filter((flat) => flat.occupancy_status === 'vacant').length,
    }
  })
}

export async function archiveBuilding(userId: string, buildingId: string): Promise<void> {
  const supabase = createServerSupabase()
  const building = await getBuilding(buildingId)

  const { error } = await supabase
    .from('buildings')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', buildingId)

  if (error) throw toAppError(error)

  await writeAuditLog({
    orgId: building.org_id,
    actorId: userId,
    action: 'building.archived',
    entityType: 'building',
    entityId: buildingId,
    before: { name: building.name },
  })
}

/** Free plan allows one building; Pro is unlimited. */
async function assertBuildingQuotaAvailable(orgId: string) {
  const supabase = createServerSupabase()

  const [{ data: subscription }, { count }] = await Promise.all([
    supabase
      .from('subscriptions')
      .select('plan, building_limit, status')
      .eq('org_id', orgId)
      .neq('status', 'cancelled')
      .maybeSingle(),
    supabase
      .from('buildings')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .is('archived_at', null),
  ])

  if (!subscription) throw forbidden('This organization has no active plan.')
  if (subscription.plan === 'pro') return

  if ((count ?? 0) >= subscription.building_limit) {
    throw new AppError(
      'plan_limit_reached',
      `The Free plan covers ${subscription.building_limit} building. Upgrade to Pro to add more.`,
    )
  }
}
