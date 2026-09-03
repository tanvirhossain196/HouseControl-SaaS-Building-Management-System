'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireSession } from '@/lib/auth/session'
import { assertFlatPermission } from '@/lib/auth/guards'
import { toAppError } from '@/lib/errors'
import {
  acceptTransfer,
  cancelTransfer,
  confirmTransferCode,
  resendCode,
  rollbackTransfer,
  startTransfer,
} from '@/services/transfers.service'
import { uuid } from '@/lib/validation/common'
import type { ActionResult } from '@/types'

/**
 * Moderator handover.
 *
 * Starting, coding and accepting are personal acts, checked against who the
 * caller is inside the flat rather than a permission — an owner cannot press
 * accept on a resident's behalf. Rolling back is the opposite: it is the
 * owner's power, so it goes through the permission check.
 */

function invalid(error: z.ZodError): Extract<ActionResult<never>, { ok: false }> {
  const fieldErrors: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form'
    ;(fieldErrors[key] ??= []).push(issue.message)
  }
  return { ok: false, error: 'Some fields need fixing.', fieldErrors }
}

function refresh(flatId?: string) {
  revalidatePath('/dashboard')
  revalidatePath('/flats')
  if (flatId) revalidatePath(`/flats/${flatId}`)
}

const startSchema = z.object({
  flatId: uuid,
  toUserId: uuid,
  note: z.string().trim().max(200).optional(),
})

export async function startTransferAction(
  input: unknown,
): Promise<ActionResult<{ transferId: string; sentTo: string }>> {
  const parsed = startSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  try {
    const session = await requireSession()
    const result = await startTransfer(
      session.userId,
      parsed.data.flatId,
      parsed.data.toUserId,
      parsed.data.note,
    )
    refresh(parsed.data.flatId)
    return { ok: true, data: result }
  } catch (error) {
    return { ok: false, error: toAppError(error).message }
  }
}

const codeSchema = z.object({
  transferId: uuid,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'The code is six digits.'),
})

export async function confirmTransferCodeAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const parsed = codeSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  try {
    const session = await requireSession()
    await confirmTransferCode(session.userId, parsed.data.transferId, parsed.data.code)
    refresh()
    return { ok: true, data: null }
  } catch (error) {
    return { ok: false, error: toAppError(error).message }
  }
}

export async function resendCodeAction(
  transferId: string,
): Promise<ActionResult<{ sentTo: string }>> {
  try {
    const session = await requireSession()
    const result = await resendCode(session.userId, transferId)
    return { ok: true, data: result }
  } catch (error) {
    return { ok: false, error: toAppError(error).message }
  }
}

/** The incoming resident's answer. Only they can give it. */
export async function respondToTransferAction(
  transferId: string,
  answer: 'accept' | 'decline',
): Promise<ActionResult<null>> {
  try {
    const session = await requireSession()

    if (answer === 'accept') {
      await acceptTransfer(session.userId, transferId)
    } else {
      await cancelTransfer(session.userId, transferId, 'recipient')
    }

    refresh()
    return { ok: true, data: null }
  } catch (error) {
    return { ok: false, error: toAppError(error).message }
  }
}

/** The outgoing moderator calling it off before it completes. */
export async function withdrawTransferAction(
  transferId: string,
): Promise<ActionResult<null>> {
  try {
    const session = await requireSession()
    await cancelTransfer(session.userId, transferId, 'sender')
    refresh()
    return { ok: true, data: null }
  } catch (error) {
    return { ok: false, error: toAppError(error).message }
  }
}

const rollbackSchema = z.object({
  transferId: uuid,
  flatId: uuid,
  reason: z.string().trim().min(5, 'Say why this is being undone.').max(300),
})

/** The owner's seven-day undo. */
export async function rollbackTransferAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const parsed = rollbackSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  try {
    const session = await assertFlatPermission(
      parsed.data.flatId,
      'flat.assign_moderator',
    )
    await rollbackTransfer(session.userId, parsed.data.transferId, parsed.data.reason)
    refresh(parsed.data.flatId)
    return { ok: true, data: null }
  } catch (error) {
    return { ok: false, error: toAppError(error).message }
  }
}
