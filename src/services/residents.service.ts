import 'server-only'

import { createServerSupabase } from '@/lib/supabase/server'
import { AppError, conflict, notFound, toAppError } from '@/lib/errors'
import { writeAuditLog } from './audit.service'
import { getFlat } from './flats.service'
import { checkShares, redistribute } from '@/lib/rent-split'
import type { FlatMemberRow, FlatRole } from '@/types'

/**
 * Who lives in a flat, and what part of the rent each of them pays.
 *
 * The share total is checked here and again by a trigger in migration 0006.
 * This copy exists to produce a message a person can act on; the database
 * copy exists because forms can be bypassed.
 */

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

export async function listResidents(flatId: string): Promise<Resident[]> {
  const supabase = createServerSupabase()

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

  if (membersResult.error) throw toAppError(membersResult.error)

  // Embedded selects are not expressible in the hand-written Database type.
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

export type ShareUpdate = { memberId: string; share: number }

/**
 * Rewrites every share in one flat at once.
 *
 * Saving shares one at a time would trip the database's share-total trigger
 * halfway through — the intermediate state is invalid even when the final one
 * is not. So the total is validated first, then the rows are written with the
 * trigger disabled for the duration by writing the smallest values first.
 */
export async function updateRentShares(
  userId: string,
  flatId: string,
  updates: ShareUpdate[],
): Promise<void> {
  const supabase = createServerSupabase()
  const flat = await getFlat(flatId)

  const check = checkShares(
    updates.map((update) => update.share),
    Number(flat.monthly_rent),
  )

  if (!check.ok) throw new AppError('validation_failed', check.message)

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

  /**
   * Order matters. The trigger checks "this share plus everyone else's" on
   * each row, so decreases have to land before increases — otherwise a
   * straight swap of 10,000 and 14,500 would momentarily total 29,000 and be
   * rejected.
   */
  const ordered = [...updates].sort((a, b) => {
    const beforeA = currentById.get(a.memberId)?.rentShare ?? 0
    const beforeB = currentById.get(b.memberId)?.rentShare ?? 0
    return a.share - beforeA - (b.share - beforeB)
  })

  for (const update of ordered) {
    const { error } = await supabase
      .from('flat_members')
      .update({ rent_share: update.share })
      .eq('id', update.memberId)
      .eq('flat_id', flatId)

    if (error) throw toAppError(error)
  }

  await writeAuditLog({
    actorId: userId,
    action: 'rent.shares_updated',
    entityType: 'flat',
    entityId: flatId,
    before: Object.fromEntries(current.map((r) => [r.fullName, r.rentShare])),
    after: Object.fromEntries(
      ordered.map((u) => [currentById.get(u.memberId)?.fullName ?? u.memberId, u.share]),
    ),
  })
}

/** Splits the flat's rent evenly, or in proportion to the current shares. */
export async function rebalanceShares(
  userId: string,
  flatId: string,
  mode: 'equal' | 'proportional',
): Promise<ShareUpdate[]> {
  const flat = await getFlat(flatId)
  const residents = await listResidents(flatId)

  if (residents.length === 0) throw conflict('There is nobody in this flat yet.')

  const rent = Number(flat.monthly_rent)
  const shares =
    mode === 'equal'
      ? redistribute(
          residents.map((resident) => ({ id: resident.id, share: 0 })),
          rent,
        )
      : redistribute(
          residents.map((resident) => ({ id: resident.id, share: resident.rentShare })),
          rent,
        )

  const updates = shares.map((share) => ({ memberId: share.id, share: share.share }))
  await updateRentShares(userId, flatId, updates)
  return updates
}

/**
 * Moving someone out.
 *
 * The membership is marked `left` rather than deleted, so their payment
 * history stays attached to a real person. Their share of the rent is spread
 * over whoever remains, in the proportion those people were already paying.
 */
export async function removeResident(
  userId: string,
  flatId: string,
  memberId: string,
  reason?: string,
): Promise<{ redistributed: ShareUpdate[] }> {
  const supabase = createServerSupabase()
  const residents = await listResidents(flatId)
  const leaving = residents.find((resident) => resident.id === memberId)

  if (!leaving) throw notFound('That resident')

  if (leaving.role === 'moderator' && residents.length > 1) {
    throw conflict(
      'This person is the flat moderator. Hand the role to another resident before removing them.',
    )
  }

  if (leaving.outstanding > 0) {
    // Not a hard stop — people do leave owing money — but it is recorded.
    await writeAuditLog({
      actorId: userId,
      action: 'resident.removed_with_balance',
      entityType: 'flat_member',
      entityId: memberId,
      after: { outstanding: leaving.outstanding },
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

  if (error) throw toAppError(error)

  const remaining = residents.filter((resident) => resident.id !== memberId)
  let redistributed: ShareUpdate[] = []

  if (remaining.length > 0) {
    const flat = await getFlat(flatId)
    redistributed = redistribute(
      remaining.map((resident) => ({ id: resident.id, share: resident.rentShare })),
      Number(flat.monthly_rent),
    ).map((share) => ({ memberId: share.id, share: share.share }))

    await updateRentShares(userId, flatId, redistributed)
  } else {
    await supabase.from('flats').update({ occupancy_status: 'vacant' }).eq('id', flatId)
  }

  await writeAuditLog({
    actorId: userId,
    action: 'resident.removed',
    entityType: 'flat_member',
    entityId: memberId,
    before: { name: leaving.fullName, share: leaving.rentShare },
    after: { reason: reason ?? null, remaining: remaining.length },
  })

  return { redistributed }
}

/**
 * Makes a resident the flat's moderator.
 *
 * This is the owner's version, used when a flat has no moderator or the
 * current one has gone quiet. The resident-to-resident handover, with consent
 * from both sides and an OTP, is Phase 8 — this one is logged as an
 * administrative action precisely because it skips that.
 */
export async function assignModerator(
  userId: string,
  flatId: string,
  memberId: string,
): Promise<void> {
  const supabase = createServerSupabase()
  const residents = await listResidents(flatId)
  const incoming = residents.find((resident) => resident.id === memberId)

  if (!incoming) throw notFound('That resident')
  if (incoming.role === 'moderator') throw conflict('They already moderate this flat.')

  if (!incoming.phoneVerified) {
    throw new AppError(
      'validation_failed',
      `${incoming.fullName} needs a verified mobile number first — role handovers are confirmed by SMS.`,
    )
  }

  const outgoing = residents.find((resident) => resident.role === 'moderator')

  // The single-moderator index means the old one has to step down first.
  if (outgoing) {
    const { error } = await supabase
      .from('flat_members')
      .update({ role: 'resident' })
      .eq('id', outgoing.id)

    if (error) throw toAppError(error)
  }

  const { error } = await supabase
    .from('flat_members')
    .update({ role: 'moderator' })
    .eq('id', memberId)
    .eq('flat_id', flatId)

  if (error) throw toAppError(error)

  await writeAuditLog({
    actorId: userId,
    action: 'moderator.assigned_by_owner',
    entityType: 'flat',
    entityId: flatId,
    before: outgoing ? { moderator: outgoing.fullName } : null,
    after: { moderator: incoming.fullName },
  })
}

/** Every resident across an organization — the owner's directory. */
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

  if (!buildings?.length) return []

  const { data: flats } = await supabase
    .from('flats')
    .select('id, unit_number, building_id')
    .in(
      'building_id',
      buildings.map((building) => building.id),
    )
    .is('archived_at', null)

  if (!flats?.length) return []

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
