'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { assertFlatPermission } from '@/lib/auth/guards'
import { toAppError } from '@/lib/errors'
import {
  assignModerator,
  rebalanceShares,
  removeResident,
  updateRentShares,
} from '@/services/residents.service'
import { createInvite } from '@/services/invites.service'
import { getBuilding } from '@/services/buildings.service'
import { getFlat } from '@/services/flats.service'
import { email, money, uuid } from '@/lib/validation/common'
import type { ActionResult } from '@/types'

/**
 * Everything a moderator does to their own flat. The owner of the
 * organization can do the same things — `assertFlatPermission` resolves the
 * flat's organization, so both routes lead to the same check.
 */

const sharesSchema = z.object({
  flatId: uuid,
  shares: z
    .array(z.object({ memberId: uuid, share: money }))
    .min(1, 'Add at least one resident.')
    .max(20),
})

const removeSchema = z.object({
  flatId: uuid,
  memberId: uuid,
  reason: z.string().trim().max(200).optional(),
})

function invalid(error: z.ZodError): Extract<ActionResult<never>, { ok: false }> {
  const fieldErrors: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form'
    ;(fieldErrors[key] ??= []).push(issue.message)
  }
  return { ok: false, error: 'Some fields need fixing.', fieldErrors }
}

function refresh(flatId: string) {
  revalidatePath(`/flats/${flatId}`)
  revalidatePath('/admin/residents')
  revalidatePath('/dashboard')
}

export async function saveSharesAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = sharesSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  try {
    const session = await assertFlatPermission(parsed.data.flatId, 'rent.assign')
    await updateRentShares(session.userId, parsed.data.flatId, parsed.data.shares)
    refresh(parsed.data.flatId)
    return { ok: true, data: null }
  } catch (error) {
    return { ok: false, error: toAppError(error).message }
  }
}

export async function rebalanceSharesAction(
  flatId: string,
  mode: 'equal' | 'proportional',
): Promise<ActionResult<null>> {
  try {
    const session = await assertFlatPermission(flatId, 'rent.assign')
    await rebalanceShares(session.userId, flatId, mode)
    refresh(flatId)
    return { ok: true, data: null }
  } catch (error) {
    return { ok: false, error: toAppError(error).message }
  }
}

export async function removeResidentAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = removeSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  try {
    const session = await assertFlatPermission(parsed.data.flatId, 'resident.remove')
    await removeResident(
      session.userId,
      parsed.data.flatId,
      parsed.data.memberId,
      parsed.data.reason,
    )
    refresh(parsed.data.flatId)
    return { ok: true, data: null }
  } catch (error) {
    return { ok: false, error: toAppError(error).message }
  }
}

/**
 * Owner-only shortcut for a flat whose moderator has gone quiet. The
 * consent-based handover between residents is Phase 8.
 */
export async function assignModeratorAction(
  flatId: string,
  memberId: string,
): Promise<ActionResult<null>> {
  try {
    const session = await assertFlatPermission(flatId, 'flat.assign_moderator')
    await assignModerator(session.userId, flatId, memberId)
    refresh(flatId)
    return { ok: true, data: null }
  } catch (error) {
    return { ok: false, error: toAppError(error).message }
  }
}

const inviteToFlatSchema = z.object({
  flatId: uuid,
  email,
  role: z.enum(['member', 'moderator']),
  rentShare: z.coerce.number().pipe(money).optional(),
})

/**
 * A moderator inviting someone into their own flat.
 *
 * The organization is resolved from the flat rather than taken from the form,
 * so a moderator cannot name an organization they have no rights in. Until
 * Phase 11 sends the email, the caller shows the link once.
 */
export async function inviteToFlatAction(
  input: unknown,
): Promise<ActionResult<{ link: string }>> {
  const parsed = inviteToFlatSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  try {
    const session = await assertFlatPermission(parsed.data.flatId, 'resident.invite')
    const flat = await getFlat(parsed.data.flatId)
    const building = await getBuilding(flat.building_id)

    const { link } = await createInvite(session.userId, {
      orgId: building.org_id,
      email: parsed.data.email,
      role: parsed.data.role,
      flatId: parsed.data.flatId,
      rentShare: parsed.data.rentShare,
    })

    refresh(parsed.data.flatId)
    return { ok: true, data: { link } }
  } catch (error) {
    return { ok: false, error: toAppError(error).message }
  }
}
