import 'server-only'

import { createServerSupabase } from '@/lib/supabase/server'
import type { Db } from './flats.service'
import { AppError, conflict, notFound, toAppError } from '@/lib/errors'
import { writeAuditLog } from './audit.service'
import { getFlat } from './flats.service'
import { checkShareCapacity, redistribute } from '@/lib/rent-split'
import type { FlatMemberRow, FlatRole } from '@/types'

export type Resident = {
  id: string
  userId: string
  fullName: string
  email: string
  phone: string | null
  phoneVerified: boolean
  role: FlatRole
  rentShare: number
  joinedAt: string
  outstanding: number
}

export async function listResidents(flatId: string, db?: Db): Promise<Resident[]> {
  const supabase = db ?? createServerSupabase()

  const [membersResult, duesResult] = await Promise.all([
    supabase
      .from('flat_members')
      .select(
        'id, user_id, role, rent_share, joined_at, profiles(full_name, email, phone, phone_verified_at)',
      )
      .eq('flat_id', flatId)
      .eq('status', 'active')
      .order('role')
      .order('joined_at'),

    supabase
      .from('dues')
      .select('user_id, amount, amount_paid')
      .eq('flat_id', flatId)
      .in('status', ['open', 'partially_paid']),
  ])

  if (membersResult.error) {
    throw toAppError(membersResult.error)
  }

  const rows = (membersResult.data ?? []) as unknown as (Pick<
    FlatMemberRow,
    'id' | 'user_id' | 'role' | 'rent_share' | 'joined_at'
  > & {
    profiles: {
      full_name: string
      email: string
      phone: string | null
      phone_verified_at: string | null
    } | null
  })[]

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    fullName: row.profiles?.full_name ?? 'Unknown',
    email: row.profiles?.email ?? '',
    phone: row.profiles?.phone ?? null,
    phoneVerified: Boolean(row.profiles?.phone_verified_at),
    role: row.role,
    rentShare: Number(row.rent_share),
    joinedAt: row.joined_at,
    outstanding: (duesResult.data ?? [])
      .filter((due) => due.user_id === row.user_id)
      .reduce((sum, due) => sum + (Number(due.amount) - Number(due.amount_paid)), 0),
  }))
}

export type ShareUpdate = {
  memberId: string
  share: number
}

export async function updateRentShares(
  userId: string,
  flatId: string,
  updates: ShareUpdate[],
): Promise<void> {
  const supabase = createServerSupabase()
  const flat = await getFlat(flatId)

  const check = checkShareCapacity(
    updates.map((update) => update.share),
    Number(flat.monthly_rent),
  )

  if (!check.ok) {
    throw new AppError('validation_failed', check.message)
  }

  const current = await listResidents(flatId)
  const currentById = new Map(current.map((resident) => [resident.id, resident]))

  for (const update of updates) {
    if (!currentById.has(update.memberId)) {
      throw notFound('One of those residents')
    }
  }

  if (updates.length !== current.length) {
    throw new AppError(
      'bad_request',
      'Every resident in the flat needs a share. Reload the page and try again.',
    )
  }

  const ordered = [...updates].sort((a, b) => {
    const beforeA = currentById.get(a.memberId)?.rentShare ?? 0

    const beforeB = currentById.get(b.memberId)?.rentShare ?? 0

    return a.share - beforeA - (b.share - beforeB)
  })

  for (const update of ordered) {
    const { error } = await supabase
      .from('flat_members')
      .update({
        rent_share: update.share,
      })
      .eq('id', update.memberId)
      .eq('flat_id', flatId)

    if (error) {
      throw toAppError(error)
    }
  }

  await writeAuditLog({
    actorId: userId,
    action: 'rent.shares_updated',
    entityType: 'flat',
    entityId: flatId,
    before: Object.fromEntries(
      current.map((resident) => [resident.fullName, resident.rentShare]),
    ),
    after: Object.fromEntries(
      ordered.map((update) => [
        currentById.get(update.memberId)?.fullName ?? update.memberId,
        update.share,
      ]),
    ),
  })
}

export async function rebalanceShares(
  userId: string,
  flatId: string,
  mode: 'equal' | 'proportional',
): Promise<ShareUpdate[]> {
  const flat = await getFlat(flatId)
  const residents = await listResidents(flatId)

  if (residents.length === 0) {
    throw conflict('There is nobody in this flat yet.')
  }

  const rent = Number(flat.monthly_rent)

  const shares =
    mode === 'equal'
      ? redistribute(
          residents.map((resident) => ({
            id: resident.id,
            share: 0,
          })),
          rent,
        )
      : redistribute(
          residents.map((resident) => ({
            id: resident.id,
            share: resident.rentShare,
          })),
          rent,
        )

  const updates = shares.map((share) => ({
    memberId: share.id,
    share: share.share,
  }))

  await updateRentShares(userId, flatId, updates)

  return updates
}

/**
 * Moves a resident out of the flat.
 *
 * The resident's membership is marked as `left`, not deleted.
 * Their payment history remains preserved.
 *
 * Their previous rent share becomes available rent.
 * Existing residents keep their current rent shares.
 */
/**
 * A resident moves themselves out.
 *
 * Separate from removeResident because the rules differ, not because the SQL
 * does. A moderator removing someone is an administrative act; leaving is a
 * decision the person is entitled to make about their own tenancy, and making
 * them wait for a moderator to press a button would be the wrong shape.
 *
 * What it does not do is settle anything. Dues carry `user_id`, so an unpaid
 * charge stays attached to the person who left and keeps appearing in arrears.
 * Leaving is not a way out of a balance, and the confirmation says so before
 * anyone presses it.
 *
 * The last moderator cannot walk out of a flat with other residents still in
 * it — someone has to be able to confirm their payments tomorrow.
 */
export async function leaveFlat(
  userId: string,
  flatId: string,
  reason?: string,
): Promise<{ outstanding: number }> {
  const supabase = createServerSupabase()
  const residents = await listResidents(flatId)

  // listResidents already returns only active members, so being in the list is
  // the same as still living here.
  const me = residents.find((resident) => resident.userId === userId)

  if (!me) {
    throw notFound('Your place in that flat')
  }

  const othersRemain = residents.some((resident) => resident.id !== me.id)

  if (me.role === 'moderator' && othersRemain) {
    throw conflict(
      'You run this flat. Hand the moderator role to another resident before you move out.',
    )
  }

  const { error } = await supabase
    .from('flat_members')
    .update({
      status: 'left',
      left_at: new Date().toISOString().slice(0, 10),
      left_reason: reason ?? 'Moved out',
      rent_share: 0,
    })
    .eq('id', me.id)
    .eq('flat_id', flatId)

  if (error) throw toAppError(error)

  await writeAuditLog({
    actorId: userId,
    action: 'resident.moved_out',
    entityType: 'flat_member',
    entityId: me.id,
    after: {
      flatId,
      outstanding: me.outstanding,
      reason: reason ?? 'Moved out',
    },
  })

  return { outstanding: me.outstanding }
}

/**
 * Moves a resident from one flat to another.
 *
 * Two writes, not one: the old membership is closed and a new one opened.
 * Editing `flat_id` in place would rewrite history — every past due and payment
 * is attached to a flat, and a resident who owed four months on 2A would
 * suddenly appear to have owed it on 3B.
 *
 * What travels: the person. What stays: their ledger, and their role. Moderator
 * is a responsibility for a particular flat, so somebody moving in arrives as a
 * resident and is made moderator again deliberately if that is wanted.
 *
 * The rent share starts at zero. Guessing it would quietly change what the
 * existing residents of the target flat owe, and that is the owner's decision
 * rather than a side effect of a move.
 */
export async function transferResident(
  actorId: string,
  flatId: string,
  memberId: string,
  targetFlatId: string,
): Promise<{ unitNumber: string }> {
  const supabase = createServerSupabase()

  if (flatId === targetFlatId) {
    throw conflict('They already live in that flat.')
  }

  const residents = await listResidents(flatId)
  const member = residents.find((resident) => resident.id === memberId)

  if (!member) {
    throw notFound('That resident')
  }

  // The last moderator cannot walk out of a flat that still has people in it.
  const othersRemain = residents.some((resident) => resident.id !== member.id)

  if (member.role === 'moderator' && othersRemain) {
    throw conflict(
      'They run this flat. Hand the moderator role to another resident before moving them.',
    )
  }

  const { data: target, error: targetError } = await supabase
    .from('flats')
    .select('id, unit_number, archived_at')
    .eq('id', targetFlatId)
    .maybeSingle()

  if (targetError) throw toAppError(targetError)
  if (!target || target.archived_at) throw notFound('That flat')

  const { data: existing } = await supabase
    .from('flat_members')
    .select('id')
    .eq('flat_id', targetFlatId)
    .eq('user_id', member.userId)
    .eq('status', 'active')
    .maybeSingle()

  if (existing) {
    throw conflict(`They are already living in flat ${target.unit_number}.`)
  }

  const today = new Date().toISOString().slice(0, 10)

  const { error: closeError } = await supabase
    .from('flat_members')
    .update({
      status: 'left',
      left_at: today,
      left_reason: `Moved to flat ${target.unit_number}`,
      rent_share: 0,
    })
    .eq('id', memberId)
    .eq('status', 'active')

  if (closeError) throw toAppError(closeError)

  const { error: openError } = await supabase.from('flat_members').insert({
    flat_id: targetFlatId,
    user_id: member.userId,
    role: 'resident',
    status: 'active',
    rent_share: 0,
    joined_at: today,
  })

  if (openError) throw toAppError(openError)

  await writeAuditLog({
    actorId,
    action: 'resident.transferred',
    entityType: 'flat_member',
    entityId: memberId,
    before: { flatId, role: member.role, rentShare: member.rentShare },
    after: { flatId: targetFlatId, unitNumber: target.unit_number, role: 'resident' },
  })

  return { unitNumber: target.unit_number }
}

export type BuildingMoveResult = {
  moved: number
  unplaced: string[]
}

/**
 * Moves everyone out of one building and into vacant flats in another.
 *
 * Used before closing a building, so a landlord emptying one block into the
 * next does not have to move twenty people one at a time.
 *
 * Placement is first vacant flat, in floor order. It does not try to be clever
 * about matching sizes or rents — it cannot know which resident belongs in
 * which flat, and a wrong guess is harder to notice than an obvious one. Anyone
 * who does not fit is named in the result rather than silently dropped.
 *
 * Moderators move too, but arrive as residents: whoever runs the destination
 * building already has that job.
 */
export async function moveBuildingResidents(
  actorId: string,
  buildingId: string,
  targetBuildingId: string,
): Promise<BuildingMoveResult> {
  const supabase = createServerSupabase()

  if (buildingId === targetBuildingId) {
    throw conflict('Pick a different building to move them into.')
  }

  const { data: sourceFlats } = await supabase
    .from('flats')
    .select('id, unit_number')
    .eq('building_id', buildingId)
    .is('archived_at', null)

  const sourceIds = (sourceFlats ?? []).map((flat) => flat.id)

  if (sourceIds.length === 0) {
    return { moved: 0, unplaced: [] }
  }

  const [{ data: members }, { data: targetFlats }] = await Promise.all([
    supabase
      .from('flat_members')
      .select('id, user_id, flat_id, profiles!user_id(full_name)')
      .in('flat_id', sourceIds)
      .eq('status', 'active'),
    supabase
      .from('flats')
      .select('id, unit_number, floor')
      .eq('building_id', targetBuildingId)
      .eq('occupancy_status', 'vacant')
      .is('archived_at', null)
      .order('floor')
      .order('unit_number'),
  ])

  const people = (members ?? []) as unknown as Array<{
    id: string
    user_id: string
    flat_id: string
    profiles: { full_name: string } | null
  }>

  const vacancies = [...(targetFlats ?? [])]
  const unitOf = new Map((sourceFlats ?? []).map((flat) => [flat.id, flat.unit_number]))

  let moved = 0
  const unplaced: string[] = []

  for (const person of people) {
    const destination = vacancies.shift()
    const name = person.profiles?.full_name ?? 'Someone'

    if (!destination) {
      unplaced.push(`${name} (flat ${unitOf.get(person.flat_id) ?? '—'})`)
      continue
    }

    try {
      await transferResident(actorId, person.flat_id, person.id, destination.id)
      moved += 1
    } catch (cause) {
      // A moderator who cannot leave yet, or a clash — named, not swallowed.
      console.error('[building-move]', person.id, cause)
      unplaced.push(`${name} (flat ${unitOf.get(person.flat_id) ?? '—'})`)
      vacancies.unshift(destination)
    }
  }

  await writeAuditLog({
    actorId,
    action: 'building.residents_moved',
    entityType: 'building',
    entityId: buildingId,
    after: { targetBuildingId, moved, unplaced: unplaced.length },
  })

  return { moved, unplaced }
}

export async function removeResident(
  userId: string,
  flatId: string,
  memberId: string,
  reason?: string,
): Promise<{ redistributed: ShareUpdate[] }> {
  const supabase = createServerSupabase()
  const residents = await listResidents(flatId)

  const leaving = residents.find((resident) => resident.id === memberId)

  if (!leaving) {
    throw notFound('That resident')
  }

  if (leaving.role === 'moderator' && residents.length > 1) {
    throw conflict(
      'This person is the flat moderator. Hand the role to another resident before removing them.',
    )
  }

  if (leaving.outstanding > 0) {
    await writeAuditLog({
      actorId: userId,
      action: 'resident.removed_with_balance',
      entityType: 'flat_member',
      entityId: memberId,
      after: {
        outstanding: leaving.outstanding,
      },
    })
  }

  const { error } = await supabase
    .from('flat_members')
    .update({
      status: 'left',
      left_at: new Date().toISOString().slice(0, 10),
      left_reason: reason ?? null,
      rent_share: 0,
    })
    .eq('id', memberId)
    .eq('flat_id', flatId)

  if (error) {
    throw toAppError(error)
  }

  const remaining = residents.filter((resident) => resident.id !== memberId)

  /*
   * Do not redistribute rent here.
   *
   * Example:
   *
   * Flat rent:       ৳10,000
   * Moderator share: ৳5,000
   * Member share:    ৳5,000
   *
   * After member moves out:
   *
   * Moderator share: ৳5,000
   * Remaining rent:  ৳5,000
   */

  if (remaining.length === 0) {
    const { error: flatError } = await supabase
      .from('flats')
      .update({
        occupancy_status: 'vacant',
      })
      .eq('id', flatId)

    if (flatError) {
      throw toAppError(flatError)
    }
  }

  await writeAuditLog({
    actorId: userId,
    action: 'resident.removed',
    entityType: 'flat_member',
    entityId: memberId,
    before: {
      name: leaving.fullName,
      share: leaving.rentShare,
    },
    after: {
      reason: reason ?? null,
      remaining: remaining.length,
      releasedRentShare: leaving.rentShare,
    },
  })

  return {
    redistributed: [],
  }
}

export async function assignModerator(
  userId: string,
  flatId: string,
  memberId: string,
): Promise<void> {
  const supabase = createServerSupabase()
  const residents = await listResidents(flatId)

  const incoming = residents.find((resident) => resident.id === memberId)

  if (!incoming) {
    throw notFound('That resident')
  }

  if (incoming.role === 'moderator') {
    throw conflict('They already moderate this flat.')
  }

  if (!incoming.phoneVerified) {
    throw new AppError(
      'validation_failed',
      `${incoming.fullName} needs a verified mobile number first — role handovers are confirmed by SMS.`,
    )
  }

  const outgoing = residents.find((resident) => resident.role === 'moderator')

  if (outgoing) {
    const { error } = await supabase
      .from('flat_members')
      .update({
        role: 'resident',
      })
      .eq('id', outgoing.id)

    if (error) {
      throw toAppError(error)
    }
  }

  const { error } = await supabase
    .from('flat_members')
    .update({
      role: 'moderator',
    })
    .eq('id', memberId)
    .eq('flat_id', flatId)

  if (error) {
    throw toAppError(error)
  }

  await writeAuditLog({
    actorId: userId,
    action: 'moderator.assigned_by_owner',
    entityType: 'flat',
    entityId: flatId,
    before: outgoing
      ? {
          moderator: outgoing.fullName,
        }
      : null,
    after: {
      moderator: incoming.fullName,
    },
  })
}

export type DirectoryEntry = Resident & {
  flatId: string
  unitNumber: string
  buildingName: string
}

export async function listOrgResidents(orgId: string): Promise<DirectoryEntry[]> {
  const supabase = createServerSupabase()

  const { data: buildings } = await supabase
    .from('buildings')
    .select('id, name')
    .eq('org_id', orgId)
    .is('archived_at', null)

  if (!buildings?.length) {
    return []
  }

  const { data: flats } = await supabase
    .from('flats')
    .select('id, unit_number, building_id')
    .in(
      'building_id',
      buildings.map((building) => building.id),
    )
    .is('archived_at', null)

  if (!flats?.length) {
    return []
  }

  const entries = await Promise.all(
    flats.map(async (flat) => {
      const residents = await listResidents(flat.id).catch(() => [])

      const building = buildings.find((item) => item.id === flat.building_id)

      return residents.map((resident) => ({
        ...resident,
        flatId: flat.id,
        unitNumber: flat.unit_number,
        buildingName: building?.name ?? '',
      }))
    }),
  )

  return entries.flat()
}
