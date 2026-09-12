'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireSession } from '@/lib/auth/session'
import { toAppError } from '@/lib/errors'
import {
  confirmRemittancePayment,
  rejectRemittancePayment,
  submitRemittancePayment,
  updateRemittanceDueDate,
} from '@/services/remittances.service'
import type { ActionResult } from '@/types'

/**
 * Handovers from a moderator to the owner.
 *
 * Neither action checks who the caller is beyond having a session. It does not
 * need to: RLS decides. A moderator can only insert against their own
 * remittance and only as pending, and only an admin of the building can update
 * a row to confirmed. Repeating those rules here would mean two places to keep
 * in step, and the database is the one that cannot be bypassed.
 */

const uuid = z.string().uuid('That is not a valid id.')

function invalid(error: z.ZodError): Extract<ActionResult<never>, { ok: false }> {
  const fieldErrors: Record<string, string[]> = {}

  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form'
    ;(fieldErrors[key] ??= []).push(issue.message)
  }

  return { ok: false, error: 'Some fields need fixing.', fieldErrors }
}

function refresh(buildingId?: string) {
  revalidatePath('/remittances')
  revalidatePath('/dashboard')
  if (buildingId) revalidatePath(`/admin/buildings/${buildingId}`)
}

const submitSchema = z.object({
  remittanceId: uuid,
  amount: z.coerce.number().positive('Enter an amount above zero.'),
  method: z.enum(['cash', 'bkash', 'nagad', 'bank_transfer', 'card', 'other']),
  paidAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date.')
    .optional(),
  reference: z.string().max(120).optional(),
  note: z.string().max(500).optional(),
})

export async function submitRemittanceAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = submitSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  try {
    const session = await requireSession('/remittances')

    const payment = await submitRemittancePayment(session.userId, {
      remittanceId: parsed.data.remittanceId,
      amount: parsed.data.amount,
      method: parsed.data.method,
      paidAt: parsed.data.paidAt,
      reference: parsed.data.reference || undefined,
      note: parsed.data.note || undefined,
    })

    refresh()

    return { ok: true, data: { id: payment.id } }
  } catch (error) {
    return { ok: false, error: toAppError(error).message }
  }
}

const reviewSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('confirm'), paymentId: uuid }),
  z.object({
    decision: z.literal('reject'),
    paymentId: uuid,
    reason: z.string().trim().min(3, 'Say why, in a few words.').max(500),
  }),
])

export async function reviewRemittanceAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const parsed = reviewSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  try {
    const session = await requireSession('/remittances')

    if (parsed.data.decision === 'confirm') {
      await confirmRemittancePayment(session.userId, parsed.data.paymentId)
    } else {
      await rejectRemittancePayment(
        session.userId,
        parsed.data.paymentId,
        parsed.data.reason,
      )
    }

    refresh()

    return { ok: true, data: null }
  } catch (error) {
    return { ok: false, error: toAppError(error).message }
  }
}

const dateSchema = z.object({
  remittanceId: uuid,
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date.'),
  buildingId: uuid.optional(),
})

/**
 * The owner moves a moderator's deadline after the month has been billed.
 *
 * Billing and scheduling are different jobs. Rent is billed once; a deadline
 * may be renegotiated several times, and burying that inside the billing dialog
 * meant it could only ever be set on the day the month was raised.
 */
export async function updateRemittanceDateAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const parsed = dateSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  try {
    const session = await requireSession('/remittances')

    await updateRemittanceDueDate(
      session.userId,
      parsed.data.remittanceId,
      parsed.data.dueDate,
    )

    refresh(parsed.data.buildingId)

    return { ok: true, data: null }
  } catch (error) {
    return { ok: false, error: toAppError(error).message }
  }
}