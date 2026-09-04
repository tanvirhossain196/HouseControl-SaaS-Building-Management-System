import 'server-only'

import { createServerSupabase } from '@/lib/supabase/server'
import { AppError, conflict, notFound, toAppError } from '@/lib/errors'
import { writeAuditLog } from './audit.service'
import { byFloorDescending, planUnits, type BulkPlan } from '@/lib/units'
import type { CreateFlatInput } from '@/lib/validation/property'
import type { FlatRow, OccupancyStatus } from '@/types'

/**
 * Flats — the unit of rent, and the thing everything else hangs off.
 *
 * Two rules are enforced here rather than in a form: a flat with active
 * residents cannot be archived, and the plan's unit limit applies to creation.
 * The database holds the rest (unique unit numbers, rent-share totals).
 */

export type FlatWithCounts = FlatRow & {
  residents: number
  moderatorName: string | null
  outstanding: number
}

export async function listFlats(buildingId: string): Promise<FlatRow[]> {
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('flats')
    .select('*')
    .eq('building_id', buildingId)
    .is('archived_at', null)

  if (error) throw toAppError(error)
  return [...data].sort(byFloorDescending)
}

/** Flats plus the two numbers every list screen shows: who lives there, what is owed. */
export async function listFlatsWithCounts(buildingId: string): Promise<FlatWithCounts[]> {
  const supabase = createServerSupabase()
  const flats = await listFlats(buildingId)
  if (flats.length === 0) return []

  const flatIds = flats.map((flat) => flat.id)

  const [membersResult, duesResult] = await Promise.all([
    supabase
      .from('flat_members')
      .select('flat_id, role, profiles(full_name)')
      .in('flat_id', flatIds)
      .eq('status', 'active'),
    supabase
      .from('dues')
      .select('flat_id, amount, amount_paid')
      .in('flat_id', flatIds)
      .in('status', ['open', 'partially_paid']),
  ])

  // Embedded selects are not expressible in the hand-written Database type.
  const members = (membersResult.data ?? []) as unknown as {
    flat_id: string
    role: 'moderator' | 'resident'
    profiles: { full_name: string } | null
  }[]

  return flats.map((flat) => {
    const flatMembers = members.filter((member) => member.flat_id === flat.id)
    const outstanding = (duesResult.data ?? [])
      .filter((due) => due.flat_id === flat.id)
      .reduce((sum, due) => sum + (Number(due.amount) - Number(due.amount_paid)), 0)

    return {
      ...flat,
      residents: flatMembers.length,
      moderatorName:
        flatMembers.find((member) => member.role === 'moderator')?.profiles?.full_name ??
        null,
      outstanding,
    }
  })
}

export async function getFlat(flatId: string): Promise<FlatRow> {
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('flats')
    .select('*')
    .eq('id', flatId)
    .maybeSingle()

  if (error) throw toAppError(error)
  if (!data) throw notFound('That flat')
  return data
}

export async function createFlat(
  userId: string,
  input: CreateFlatInput,
): Promise<FlatRow> {
  const supabase = createServerSupabase()
  await assertUnitQuota(input.buildingId, 1)

  const { data, error } = await supabase
    .from('flats')
    .insert({
      building_id: input.buildingId,
      unit_number: input.unitNumber,
      floor: input.floor,
      size_sqft: input.sizeSqft ?? null,
      bedrooms: input.bedrooms ?? null,
      monthly_rent: input.monthlyRent,
      landlord_rent: input.landlordRent,
      rent_due_day: input.rentDueDay,
      occupancy_status: input.occupancyStatus,
    })
    .select('*')
    .single()

  if (error) throw toAppError(error)

  await writeAuditLog({
    actorId: userId,
    action: 'flat.created',
    entityType: 'flat',
    entityId: data.id,
    after: { unit: data.unit_number, rent: data.monthly_rent },
  })

  return data
}

export async function updateFlat(
  userId: string,
  flatId: string,
  input: Partial<CreateFlatInput>,
): Promise<FlatRow> {
  const supabase = createServerSupabase()
  const before = await getFlat(flatId)

  const { data, error } = await supabase
    .from('flats')
    .update({
      ...(input.unitNumber !== undefined && { unit_number: input.unitNumber }),
      ...(input.floor !== undefined && { floor: input.floor }),
      ...(input.sizeSqft !== undefined && { size_sqft: input.sizeSqft }),
      ...(input.bedrooms !== undefined && { bedrooms: input.bedrooms }),
      ...(input.monthlyRent !== undefined && { monthly_rent: input.monthlyRent }),
      ...(input.landlordRent !== undefined && { landlord_rent: input.landlordRent }),
      ...(input.rentDueDay !== undefined && { rent_due_day: input.rentDueDay }),
      ...(input.occupancyStatus !== undefined && {
        occupancy_status: input.occupancyStatus,
      }),
    })
    .eq('id', flatId)
    .select('*')
    .single()

  if (error) throw toAppError(error)

  await writeAuditLog({
    actorId: userId,
    action: 'flat.updated',
    entityType: 'flat',
    entityId: flatId,
    before: { unit: before.unit_number, rent: before.monthly_rent },
    after: { unit: data.unit_number, rent: data.monthly_rent },
  })

  return data
}

/**
 * Archiving keeps the flat's history. Refused while people still live there,
 * because their dues and payments would be stranded on a hidden unit.
 */
export async function archiveFlat(userId: string, flatId: string): Promise<void> {
  const supabase = createServerSupabase()
  const flat = await getFlat(flatId)

  const { count } = await supabase
    .from('flat_members')
    .select('id', { count: 'exact', head: true })
    .eq('flat_id', flatId)
    .eq('status', 'active')

  if ((count ?? 0) > 0) {
    throw conflict(
      `Flat ${flat.unit_number} still has ${count} active resident${count === 1 ? '' : 's'}. Remove them first.`,
    )
  }

  const { error } = await supabase
    .from('flats')
    .update({ archived_at: new Date().toISOString(), occupancy_status: 'not_rentable' })
    .eq('id', flatId)

  if (error) throw toAppError(error)

  await writeAuditLog({
    actorId: userId,
    action: 'flat.archived',
    entityType: 'flat',
    entityId: flatId,
    before: { unit: flat.unit_number },
  })
}

export type BulkResult = { created: number; skipped: string[] }

/**
 * Generates a floor of units at a time. Existing unit numbers are skipped
 * rather than failing the whole run — an owner adding a new floor to a
 * half-entered building should not have to start over.
 */
export async function bulkCreateFlats(
  userId: string,
  buildingId: string,
  plan: BulkPlan,
  defaults: { monthlyRent: number; rentDueDay: number },
): Promise<BulkResult> {
  const supabase = createServerSupabase()
  const planned = planUnits(plan)

  if (planned.length === 0) {
    throw new AppError('bad_request', 'That plan would not create any units.')
  }
  if (planned.length > 200) {
    throw new AppError('bad_request', 'Generate at most 200 units at a time.')
  }

  const existing = await listFlats(buildingId)
  const taken = new Set(existing.map((flat) => flat.unit_number.toUpperCase()))

  const toCreate = planned.filter((unit) => !taken.has(unit.unitNumber.toUpperCase()))
  const skipped = planned
    .filter((unit) => taken.has(unit.unitNumber.toUpperCase()))
    .map((unit) => unit.unitNumber)

  if (toCreate.length === 0) {
    throw conflict('Every unit in that plan already exists.')
  }

  await assertUnitQuota(buildingId, toCreate.length)

  const { error } = await supabase.from('flats').insert(
    toCreate.map((unit) => ({
      building_id: buildingId,
      unit_number: unit.unitNumber,
      floor: unit.floor,
      monthly_rent: defaults.monthlyRent,
      rent_due_day: defaults.rentDueDay,
      occupancy_status: 'vacant' as OccupancyStatus,
    })),
  )

  if (error) throw toAppError(error)

  await writeAuditLog({
    actorId: userId,
    action: 'flat.bulk_created',
    entityType: 'building',
    entityId: buildingId,
    after: { created: toCreate.length, skipped: skipped.length },
  })

  return { created: toCreate.length, skipped }
}

/**
 * Free plan covers 12 units per organization. Checked before every insert,
 * counting units that already exist across all of the org's buildings.
 */
async function assertUnitQuota(buildingId: string, adding: number) {
  const supabase = createServerSupabase()

  const { data: building } = await supabase
    .from('buildings')
    .select('org_id')
    .eq('id', buildingId)
    .maybeSingle()

  if (!building) throw notFound('That building')

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('plan, unit_limit')
    .eq('org_id', building.org_id)
    .neq('status', 'cancelled')
    .maybeSingle()

  if (!subscription || subscription.plan === 'pro') return

  const { data: buildings } = await supabase
    .from('buildings')
    .select('id')
    .eq('org_id', building.org_id)
    .is('archived_at', null)

  const { count } = await supabase
    .from('flats')
    .select('id', { count: 'exact', head: true })
    .in(
      'building_id',
      (buildings ?? []).map((b) => b.id),
    )
    .is('archived_at', null)

  const used = count ?? 0
  if (used + adding > subscription.unit_limit) {
    throw new AppError(
      'plan_limit_reached',
      `The Free plan covers ${subscription.unit_limit} units and you have ${used}. Upgrade to Pro to add ${adding} more.`,
    )
  }
}

/**
 * Every flat in an organization, with its counts, in four queries total.
 *
 * The obvious version — `listFlatsWithCounts` once per building — costs three
 * queries per building, so an owner with six buildings paid for eighteen
 * round trips to draw one table. This does the same work in four regardless
 * of how many buildings there are.
 */
export async function listOrgFlatsWithCounts(
  orgId: string,
): Promise<(FlatWithCounts & { buildingName: string })[]> {
  const supabase = createServerSupabase()

  const { data: buildings, error: buildingError } = await supabase
    .from('buildings')
    .select('id, name')
    .eq('org_id', orgId)
    .is('archived_at', null)

  if (buildingError) throw toAppError(buildingError)
  if (!buildings?.length) return []

  const buildingIds = buildings.map((building) => building.id)
  const nameOf = new Map(buildings.map((building) => [building.id, building.name]))

  const { data: flats, error: flatError } = await supabase
    .from('flats')
    .select('*')
    .in('building_id', buildingIds)
    .is('archived_at', null)

  if (flatError) throw toAppError(flatError)
  if (!flats?.length) return []

  const flatIds = flats.map((flat) => flat.id)

  const [membersResult, duesResult] = await Promise.all([
    supabase
      .from('flat_members')
      .select('flat_id, role, profiles(full_name)')
      .in('flat_id', flatIds)
      .eq('status', 'active'),
    supabase
      .from('dues')
      .select('flat_id, amount, amount_paid')
      .in('flat_id', flatIds)
      .in('status', ['open', 'partially_paid']),
  ])

  // Embedded selects are not expressible in the hand-written Database type.
  const members = (membersResult.data ?? []) as unknown as {
    flat_id: string
    role: 'moderator' | 'resident'
    profiles: { full_name: string } | null
  }[]

  // Grouped once rather than filtered per flat, which would be quadratic on a
  // large organization.
  const byFlat = new Map<string, typeof members>()
  for (const member of members) {
    const list = byFlat.get(member.flat_id) ?? []
    list.push(member)
    byFlat.set(member.flat_id, list)
  }

  const outstandingByFlat = new Map<string, number>()
  for (const due of duesResult.data ?? []) {
    const current = outstandingByFlat.get(due.flat_id) ?? 0
    outstandingByFlat.set(
      due.flat_id,
      current + (Number(due.amount) - Number(due.amount_paid)),
    )
  }

  return [...flats].sort(byFloorDescending).map((flat) => {
    const flatMembers = byFlat.get(flat.id) ?? []
    return {
      ...flat,
      buildingName: nameOf.get(flat.building_id) ?? 'Building',
      residents: flatMembers.length,
      moderatorName:
        flatMembers.find((member) => member.role === 'moderator')?.profiles?.full_name ??
        null,
      outstanding: outstandingByFlat.get(flat.id) ?? 0,
    }
  })
}
