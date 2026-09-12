'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { assertFlatPermission } from '@/lib/auth/guards'
import { toAppError } from '@/lib/errors'
import { requireSession } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'

import {
  assignModerator,
  rebalanceShares,
  removeResident,
  leaveFlat,
  transferResident,
  updateRentShares,
} from '@/services/residents.service'

import { createInvite, revokeInvite } from '@/services/invites.service'

import {
  deactivateFlatMember,
  getDynamicRentSummary,
  getFlat,
} from '@/services/flats.service'

import { getBuilding } from '@/services/buildings.service'
import { email, money, uuid } from '@/lib/validation/common'
import type { ActionResult } from '@/types'

const sharesSchema = z.object({
  flatId: uuid,
  shares: z
    .array(
      z.object({
        memberId: uuid,
        share: money,
      }),
    )
    .min(1, 'Add at least one resident.')
    .max(20),
})

const removeSchema = z.object({
  flatId: uuid,
  memberId: uuid,
  reason: z.string().trim().max(200).optional(),
})

const deactivateSchema = z.object({
  flatId: uuid,
  memberId: uuid,
})

const visibilitySchema = z.object({
  flatId: uuid,
  showMemberPhone: z.boolean(),
  showMemberRent: z.boolean(),
  showPaymentStatus: z.boolean(),
  showDueDate: z.boolean(),
  showMemberList: z.boolean(),
  showModeratorPhone: z.boolean(),
})

function invalid(error: z.ZodError): Extract<ActionResult<never>, { ok: false }> {
  const fieldErrors: Record<string, string[]> = {}

  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form'
    ;(fieldErrors[key] ??= []).push(issue.message)
  }

  return {
    ok: false,
    error: 'Some fields need fixing.',
    fieldErrors,
  }
}

function refresh(flatId: string) {
  revalidatePath(`/flats/${flatId}`)
  revalidatePath('/flats')
  revalidatePath('/my-flat')
  revalidatePath('/admin/residents')
  revalidatePath('/dashboard')
}

export async function saveSharesAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = sharesSchema.safeParse(input)

  if (!parsed.success) {
    return invalid(parsed.error)
  }

  try {
    const session = await assertFlatPermission(parsed.data.flatId, 'rent.assign')

    await updateRentShares(session.userId, parsed.data.flatId, parsed.data.shares)

    refresh(parsed.data.flatId)

    return {
      ok: true,
      data: null,
    }
  } catch (error) {
    return {
      ok: false,
      error: toAppError(error).message,
    }
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

    return {
      ok: true,
      data: null,
    }
  } catch (error) {
    return {
      ok: false,
      error: toAppError(error).message,
    }
  }
}

export async function removeResidentAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = removeSchema.safeParse(input)

  if (!parsed.success) {
    return invalid(parsed.error)
  }

  try {
    const session = await assertFlatPermission(parsed.data.flatId, 'resident.remove')

    await removeResident(
      session.userId,
      parsed.data.flatId,
      parsed.data.memberId,
      parsed.data.reason,
    )

    refresh(parsed.data.flatId)

    return {
      ok: true,
      data: null,
    }
  } catch (error) {
    return {
      ok: false,
      error: toAppError(error).message,
    }
  }
}

export async function deactivateMemberAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const parsed = deactivateSchema.safeParse(input)

  if (!parsed.success) {
    return invalid(parsed.error)
  }

  try {
    await assertFlatPermission(parsed.data.flatId, 'resident.remove')

    await deactivateFlatMember(parsed.data.memberId)

    refresh(parsed.data.flatId)

    return {
      ok: true,
      data: null,
    }
  } catch (error) {
    return {
      ok: false,
      error: toAppError(error).message,
    }
  }
}

/**
 * Moderator/owner-controlled visibility settings for My Flat.
 */
export async function updateFlatVisibilityAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const parsed = visibilitySchema.safeParse(input)

  if (!parsed.success) {
    return invalid(parsed.error)
  }

  try {
    const session = await assertFlatPermission(parsed.data.flatId, 'resident.invite')

    const supabase = createServerSupabase()

    const { error } = await supabase.from('flat_visibility_settings').upsert(
      {
        flat_id: parsed.data.flatId,
        show_member_phone: parsed.data.showMemberPhone,
        show_member_rent: parsed.data.showMemberRent,
        show_payment_status: parsed.data.showPaymentStatus,
        show_due_date: parsed.data.showDueDate,
        show_member_list: parsed.data.showMemberList,
        show_moderator_phone: parsed.data.showModeratorPhone,
        updated_by: session.userId,
      },
      {
        onConflict: 'flat_id',
      },
    )

    if (error) {
      throw error
    }

    refresh(parsed.data.flatId)

    return {
      ok: true,
      data: null,
    }
  } catch (error) {
    return {
      ok: false,
      error: toAppError(error).message,
    }
  }
}

export async function assignModeratorAction(
  flatId: string,
  memberId: string,
): Promise<ActionResult<null>> {
  try {
    const session = await assertFlatPermission(flatId, 'flat.assign_moderator')

    await assignModerator(session.userId, flatId, memberId)

    refresh(flatId)

    return {
      ok: true,
      data: null,
    }
  } catch (error) {
    return {
      ok: false,
      error: toAppError(error).message,
    }
  }
}

const inviteToFlatSchema = z
  .object({
    flatId: uuid,
    email,
    role: z.enum(['member', 'moderator']),
    rentShare: z.coerce.number().pipe(money).optional(),
  })
  .superRefine((value, context) => {
    if (value.role === 'member' && (!value.rentShare || value.rentShare <= 0)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rentShare'],
        message: 'Enter the member rent share.',
      })
    }
  })

export async function inviteToFlatAction(
  input: unknown,
): Promise<ActionResult<{ link: string }>> {
  const parsed = inviteToFlatSchema.safeParse(input)

  if (!parsed.success) {
    return invalid(parsed.error)
  }

  try {
    const session = await assertFlatPermission(parsed.data.flatId, 'resident.invite')

    const flat = await getFlat(parsed.data.flatId)
    const building = await getBuilding(flat.building_id)
    const summary = await getDynamicRentSummary(parsed.data.flatId)
    const requestedShare = parsed.data.rentShare ?? 0

    if (requestedShare > summary.remainingRent) {
      return {
        ok: false,
        error: `Only ৳${summary.remainingRent.toLocaleString()} is available to assign in this flat. Reduce the moderator share or enter a smaller amount.`,
      }
    }

    const { link } = await createInvite(session.userId, {
      orgId: building.org_id,
      email: parsed.data.email,
      role: parsed.data.role,
      flatId: parsed.data.flatId,
      rentShare: requestedShare,
    })

    refresh(parsed.data.flatId)

    return {
      ok: true,
      data: { link },
    }
  } catch (error) {
    return {
      ok: false,
      error: toAppError(error).message,
    }
  }
}

export async function revokeInviteAction(
  flatId: string,
  inviteId: string,
): Promise<ActionResult<null>> {
  try {
    const session = await assertFlatPermission(flatId, 'resident.invite')

    await revokeInvite(session.userId, inviteId)

    refresh(flatId)

    return {
      ok: true,
      data: null,
    }
  } catch (error) {
    return {
      ok: false,
      error: toAppError(error).message,
    }
  }
}

const leaveSchema = z.object({
  flatId: z.string().uuid('That is not a valid flat.'),
  reason: z.string().trim().max(300).optional(),
})

/**
 * A resident moves themselves out.
 *
 * No flat permission is asserted, because leaving is not an administrative
 * power over the flat — it is a decision about your own tenancy. The service
 * only ever touches the caller's own membership row, and refuses if they have
 * none, so there is nothing here for someone else's row to be caught by.
 */
export async function leaveFlatAction(
  input: unknown,
): Promise<ActionResult<{ outstanding: number }>> {
  const parsed = leaveSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  try {
    const session = await requireSession('/my-flat')

    const result = await leaveFlat(session.userId, parsed.data.flatId, parsed.data.reason)

    refresh(parsed.data.flatId)
    revalidatePath('/my-flat')
    revalidatePath('/dues')

    return { ok: true, data: result }
  } catch (error) {
    return { ok: false, error: toAppError(error).message }
  }
}

const transferSchema = z.object({
  flatId: z.string().uuid('That is not a valid flat.'),
  memberId: z.string().uuid('That is not a valid resident.'),
  targetFlatId: z.string().uuid('Pick a flat to move them to.'),
})

/**
 * Moves a resident to another flat.
 *
 * Permission is asserted on both ends. Holding `resident.remove` on the flat
 * somebody is leaving does not entitle you to put them in a building you have
 * nothing to do with, so the destination is checked as a place you may invite
 * into rather than merely one you can see.
 */
export async function transferResidentAction(
  input: unknown,
): Promise<ActionResult<{ unitNumber: string }>> {
  const parsed = transferSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  try {
    const session = await assertFlatPermission(parsed.data.flatId, 'resident.remove')
    await assertFlatPermission(parsed.data.targetFlatId, 'resident.invite')

    const result = await transferResident(
      session.userId,
      parsed.data.flatId,
      parsed.data.memberId,
      parsed.data.targetFlatId,
    )

    refresh(parsed.data.flatId)
    refresh(parsed.data.targetFlatId)
    revalidatePath('/admin/residents')

    return { ok: true, data: result }
  } catch (error) {
    return { ok: false, error: toAppError(error).message }
  }
}
