import 'server-only'

import { createServerSupabase } from '@/lib/supabase/server'
import { AppError, conflict, notFound, toAppError } from '@/lib/errors'
import { writeAuditLog } from './audit.service'
import { byFloorDescending, planUnits, type BulkPlan } from '@/lib/units'
import type { CreateFlatInput } from '@/lib/validation/property'
import type { FlatRow, OccupancyStatus } from '@/types'

/**
 * Flats — the unit of rent, and the thing everything else hangs off.
 */

export type FlatWithCounts = FlatRow & {
  residents: number
  moderatorName: string | null
  outstanding: number
}

export interface MemberShare {
  id?: string
  userId?: string
  name: string
  role: string
  share: number
  status?: 'active' | 'pending'
  email?: string
  token?: string
}

export interface PendingShare {
  id?: string
  email: string
  role?: string
  share: number
  expiresAt?: string
  token?: string
}

export interface FlatRentSummary {
  flatId: string
  totalRent: number
  allocatedRent: number
  remainingRent: number
  membersShares: MemberShare[]
  pendingShares: PendingShare[]
}

export interface DynamicRentSummary {
  flatId: string
  totalRent: number
  allocatedRent: number
  remainingRent: number
  moderatorShare: number
  members: MemberShare[]
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

/**
 * The database handle these functions read through.
 *
 * Everything here normally runs as the signed-in person, so RLS decides what
 * they can see. The nightly billing job has no signed-in person, so it passes
 * the service-role client instead — the same code, a different pair of eyes.
 *
 * Threading it through beats a second copy of the billing rules for the cron to
 * drift away from. Money logic written twice is money logic that disagrees with
 * itself eventually.
 */
export type Db = ReturnType<typeof createServerSupabase>

export async function getFlat(flatId: string, db?: Db): Promise<FlatRow> {
  const supabase = db ?? createServerSupabase()
  const { data, error } = await supabase
    .from('flats')
    .select('*')
    .eq('id', flatId)
    .maybeSingle()

  if (error) throw toAppError(error)
  if (!data) throw notFound('That flat')
  return data
}

/**
 * Dynamic Rent Allocation Summary:
 * Calculates flat's total rent vs allocated shares among active members and pending invites.
 */
export async function getFlatRentSummary(flatId: string): Promise<FlatRentSummary> {
  const supabase = createServerSupabase()

  const { data: flat, error: flatError } = await supabase
    .from('flats')
    .select('id, monthly_rent')
    .eq('id', flatId)
    .maybeSingle()

  if (flatError || !flat) {
    return {
      flatId,
      totalRent: 0,
      allocatedRent: 0,
      remainingRent: 0,
      membersShares: [],
      pendingShares: [],
    }
  }

  const totalRent = Number(flat.monthly_rent ?? 0)

  const { data: membersResult, error: membersError } = await supabase
    .from('flat_members')
    .select('id, user_id, rent_share, role, profiles(full_name, email)')
    .eq('flat_id', flatId)
    .eq('status', 'active')

  if (membersError) throw toAppError(membersError)

  const members = (membersResult ?? []) as unknown as {
    id: string
    user_id: string
    rent_share: number
    role: string
    profiles: { full_name: string; email: string } | null
  }[]

  const membersShares: MemberShare[] = members.map((m) => ({
    id: m.id,
    userId: m.user_id,
    name: m.profiles?.full_name || 'Active Member',
    email: m.profiles?.email,
    role: m.role || 'resident',
    share: Number(m.rent_share || 0),
    status: 'active',
  }))

  const { data: invitesResult, error: invitesError } = await supabase
    .from('invites')
    .select('id, email, role, rent_share, expires_at')
    .eq('flat_id', flatId)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())

  if (invitesError) throw toAppError(invitesError)

  const pendingShares: PendingShare[] = ((invitesResult ?? []) as unknown as {
    id: string
    email: string
    role: string
    rent_share: number | null
    expires_at: string
  }[]).map((i) => ({
    id: i.id,
    email: i.email,
    role: i.role,
    share: Number(i.rent_share || 0),
    expiresAt: i.expires_at,
  }))

  const membersTotal = membersShares.reduce((sum, item) => sum + item.share, 0)
  const pendingTotal = pendingShares.reduce((sum, item) => sum + item.share, 0)
  const allocatedRent = membersTotal + pendingTotal
  const remainingRent = Math.max(0, totalRent - allocatedRent)

  return {
    flatId,
    totalRent,
    allocatedRent,
    remainingRent,
    membersShares,
    pendingShares,
  }
}

/**
 * Detailed Dynamic Rent Summary for Flat Management UI
 */
export async function getDynamicRentSummary(flatId: string): Promise<DynamicRentSummary> {
  const supabase = createServerSupabase()

  const { data: flat, error: flatError } = await supabase
    .from('flats')
    .select('id, monthly_rent')
    .eq('id', flatId)
    .single()

  if (flatError || !flat) throw notFound('Flat')
  const totalRent = Number(flat.monthly_rent || 0)

  const { data: activeMembers, error: activeMembersError } = await supabase
    .from('flat_members')
    .select('id, user_id, rent_share, role, profiles(full_name, email)')
    .eq('flat_id', flatId)
    .eq('status', 'active')

  if (activeMembersError) throw toAppError(activeMembersError)

  const { data: pendingInvites, error: pendingInvitesError } = await supabase
    .from('invites')
    .select('id, email, rent_share, role, expires_at')
    .eq('flat_id', flatId)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())

  if (pendingInvitesError) throw toAppError(pendingInvitesError)

  const membersList: MemberShare[] = []
  let moderatorShare = 0

  ;(activeMembers || []).forEach((m: any) => {
    const share = Number(m.rent_share || 0)
    if (m.role === 'moderator') {
      moderatorShare += share
    }
    membersList.push({
      id: m.id,
      userId: m.user_id,
      name: m.profiles?.full_name || 'Active Resident',
      email: m.profiles?.email,
      role: m.role,
      share,
      status: 'active',
    })
  })

  ;(pendingInvites || []).forEach((i: any) => {
    membersList.push({
      id: i.id,
      name: i.email.split('@')[0],
      email: i.email,
      role: i.role,
      share: Number(i.rent_share || 0),
      status: 'pending',
    })
  })

  const allocatedRent = membersList.reduce((sum, item) => sum + item.share, 0)
  const remainingRent = Math.max(0, totalRent - allocatedRent)

  return {
    flatId,
    totalRent,
    allocatedRent,
    remainingRent,
    moderatorShare,
    members: membersList,
  }
}

export async function updateMemberRentShare(
  memberId: string,
  newShare: number,
): Promise<void> {
  if (!Number.isFinite(newShare) || newShare < 0) {
    throw new AppError('bad_request', 'Rent share must be a valid non-negative amount.')
  }

  const supabase = createServerSupabase()
  const { error } = await supabase
    .from('flat_members')
    .update({ rent_share: newShare })
    .eq('id', memberId)

  if (error) throw toAppError(error)
}

export async function deactivateFlatMember(memberId: string): Promise<void> {
  const supabase = createServerSupabase()
  const { error } = await supabase
    .from('flat_members')
    .update({ status: 'suspended', rent_share: 0 })
    .eq('id', memberId)
    .in('status', ['active', 'suspended'])

  if (error) throw toAppError(error)
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
      `Your plan covers ${subscription.unit_limit} unit${subscription.unit_limit === 1 ? '' : 's'} and you have ${used}. Ask the owner to upgrade to add ${adding} more — nothing you already have stops working.`,
    )
  }
}

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

  const members = (membersResult.data ?? []) as unknown as {
    flat_id: string
    role: 'moderator' | 'resident'
    profiles: { full_name: string } | null
  }[]

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