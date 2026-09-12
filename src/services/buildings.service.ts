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

export type ArchiveBuildingSummary = {
  flats: number
  memberships: number
  outstanding: number
}

/**
 * Counts what closing a building would touch, without touching anything.
 *
 * Shown in the confirmation dialog. Nobody can weigh "are you sure?" without
 * knowing how many people it puts out and how much unpaid rent walks away with
 * them.
 */
export async function previewBuildingArchive(
  buildingId: string,
): Promise<ArchiveBuildingSummary> {
  const supabase = createServerSupabase()

  const { data: flats } = await supabase
    .from('flats')
    .select('id')
    .eq('building_id', buildingId)
    .is('archived_at', null)

  const flatIds = (flats ?? []).map((flat) => flat.id)

  if (flatIds.length === 0) {
    return { flats: 0, memberships: 0, outstanding: 0 }
  }

  const [{ count: memberships }, { data: dues }] = await Promise.all([
    supabase
      .from('flat_members')
      .select('id', { count: 'exact', head: true })
      .in('flat_id', flatIds)
      .eq('status', 'active'),
    supabase
      .from('dues')
      .select('amount, amount_paid')
      .in('flat_id', flatIds)
      .neq('status', 'paid')
      .neq('status', 'waived'),
  ])

  const outstanding = (dues ?? []).reduce((sum, due) => {
    const left = Number(due.amount) - Number(due.amount_paid)
    return sum + (left > 0 ? left : 0)
  }, 0)

  return {
    flats: flatIds.length,
    memberships: memberships ?? 0,
    outstanding: Math.round(outstanding * 100) / 100,
  }
}

/**
 * Closes a building and everything hanging off it.
 *
 * Archive, not delete. Rent that was billed, paid and receipted is an
 * accounting record, and a landlord closing a building is not a reason to
 * destroy a resident's proof that they paid. Everything stops appearing;
 * nothing stops existing.
 *
 * The cascade is the point. Archiving only the building used to leave its flats
 * live and its residents still marked as living there — memberships pointing at
 * a place that no longer shows up anywhere, which is exactly the orphan state
 * that makes counts disagree later.
 *
 * The subscription is deliberately left alone. It belongs to the organization
 * rather than to this building, and it was paid for; cancelling it here would
 * take away something bought with money because a building closed.
 */
export async function archiveBuilding(
  userId: string,
  buildingId: string,
): Promise<ArchiveBuildingSummary> {
  const supabase = createServerSupabase()
  const building = await getBuilding(buildingId)
  const summary = await previewBuildingArchive(buildingId)

  const { data: flats } = await supabase
    .from('flats')
    .select('id')
    .eq('building_id', buildingId)
    .is('archived_at', null)

  const flatIds = (flats ?? []).map((flat) => flat.id)
  const closedAt = new Date().toISOString()

  if (flatIds.length > 0) {
    // Residents first. A membership on a live flat is recoverable; a membership
    // on a flat nobody can reach is not.
    const { error: memberError } = await supabase
      .from('flat_members')
      .update({
        status: 'left',
        left_at: closedAt.slice(0, 10),
        left_reason: `${building.name} was closed`,
        rent_share: 0,
      })
      .in('flat_id', flatIds)
      .eq('status', 'active')

    if (memberError) throw toAppError(memberError)

    const { error: flatError } = await supabase
      .from('flats')
      .update({ archived_at: closedAt, occupancy_status: 'not_rentable' })
      .in('id', flatIds)

    if (flatError) throw toAppError(flatError)
  }

  const { error } = await supabase
    .from('buildings')
    .update({ archived_at: closedAt })
    .eq('id', buildingId)

  if (error) throw toAppError(error)

  await writeAuditLog({
    orgId: building.org_id,
    actorId: userId,
    action: 'building.archived',
    entityType: 'building',
    entityId: buildingId,
    before: { name: building.name },
    after: summary,
  })

  return summary
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
      `Your plan covers ${subscription.building_limit} building${subscription.building_limit === 1 ? '' : 's'}. Ask the owner to upgrade to add more.`,
    )
  }
}