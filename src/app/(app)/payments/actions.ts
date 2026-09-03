'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { assertFlatPermission, assertPermission } from '@/lib/auth/guards'
import { requireSession } from '@/lib/auth/session'
import { toAppError } from '@/lib/errors'
import { getBuilding } from '@/services/buildings.service'
import { billBuildingRent, billFlatRent, waiveDue, getDue } from '@/services/dues.service'
import {
  confirmPayment,
  getPayment,
  rejectPayment,
  reversePayment,
  submitPayment,
} from '@/services/payments.service'
import { startCheckout } from '@/services/gateway.service'
import { isoDate, money, period as periodSchema, uuid } from '@/lib/validation/common'
import type { ActionResult } from '@/types'

/**
 * Money actions.
 *
 * Submitting is something a resident does for themselves; everything else
 * needs `payment.review` in the flat's scope, which resolves through the
 * flat's organization so an owner and a moderator both reach it.
 */

const submitSchema = z.object({
  flatId: uuid,
  dueId: uuid.optional(),
  amount: z.coerce.number().pipe(money),
  method: z.enum(['cash', 'bkash', 'nagad', 'bank_transfer', 'card', 'other']),
  paidAt: isoDate,
  reference: z.string().trim().max(80).optional(),
  note: z.string().trim().max(500).optional(),
})

const reviewSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('confirm'), paymentId: uuid }),
  z.object({
    decision: z.literal('reject'),
    paymentId: uuid,
    reason: z.string().trim().min(5, 'Tell the resident why.').max(300),
  }),
  z.object({
    decision: z.literal('reverse'),
    paymentId: uuid,
    reason: z.string().trim().min(5, 'Say why it is being reversed.').max(300),
  }),
])

function invalid(error: z.ZodError): Extract<ActionResult<never>, { ok: false }> {
  const fieldErrors: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form'
    ;(fieldErrors[key] ??= []).push(issue.message)
  }
  return { ok: false, error: 'Some fields need fixing.', fieldErrors }
}

function refresh(flatId?: string) {
  revalidatePath('/dues')
  revalidatePath('/payments')
  revalidatePath('/dashboard')
  if (flatId) revalidatePath(`/flats/${flatId}`)
}

/** A resident recording money they sent. Always lands as pending. */
export async function submitPaymentAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = submitSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  try {
    const session = await requireSession()

    const belongs = session.memberships.flats.some(
      (flat) => flat.flatId === parsed.data.flatId,
    )
    if (!belongs) {
      return { ok: false, error: 'You are not a resident of that flat.' }
    }

    const payment = await submitPayment(session.userId, parsed.data)
    refresh(parsed.data.flatId)
    return { ok: true, data: { id: payment.id } }
  } catch (error) {
    return { ok: false, error: toAppError(error).message }
  }
}

/** Confirm, reject or reverse. One action, because the guard is the same. */
export async function reviewPaymentAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = reviewSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  try {
    const payment = await getPayment(parsed.data.paymentId)
    const session = await assertFlatPermission(payment.flat_id, 'payment.review')

    if (parsed.data.decision === 'confirm') {
      await confirmPayment(session.userId, parsed.data.paymentId)
    } else if (parsed.data.decision === 'reject') {
      await rejectPayment(session.userId, parsed.data.paymentId, parsed.data.reason)
    } else {
      await reversePayment(session.userId, parsed.data.paymentId, parsed.data.reason)
    }

    refresh(payment.flat_id)
    return { ok: true, data: null }
  } catch (error) {
    return { ok: false, error: toAppError(error).message }
  }
}

const billSchema = z.object({
  scope: z.enum(['flat', 'building']),
  id: uuid,
  period: periodSchema,
})

/** Bills a month. Idempotent — running it twice creates nothing the second time. */
export async function billMonthAction(
  input: unknown,
): Promise<ActionResult<{ created: number; skipped: string[] }>> {
  const parsed = billSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  try {
    if (parsed.data.scope === 'flat') {
      const session = await assertFlatPermission(parsed.data.id, 'due.manage')
      const result = await billFlatRent(
        session.userId,
        parsed.data.id,
        parsed.data.period,
      )
      refresh(parsed.data.id)
      return { ok: true, data: { created: result.created, skipped: [] } }
    }

    const building = await getBuilding(parsed.data.id)
    const session = await assertPermission('due.manage', { orgId: building.org_id })
    const result = await billBuildingRent(
      session.userId,
      parsed.data.id,
      parsed.data.period,
    )

    refresh()
    revalidatePath(`/admin/buildings/${parsed.data.id}`)
    return { ok: true, data: { created: result.created, skipped: result.skipped } }
  } catch (error) {
    return { ok: false, error: toAppError(error).message }
  }
}

const waiveSchema = z.object({
  dueId: uuid,
  reason: z.string().trim().min(5, 'Say why this charge is being written off.').max(300),
})

export async function waiveDueAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = waiveSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  try {
    const due = await getDue(parsed.data.dueId)
    const session = await assertFlatPermission(due.flat_id, 'due.manage')
    await waiveDue(session.userId, parsed.data.dueId, parsed.data.reason)
    refresh(due.flat_id)
    return { ok: true, data: null }
  } catch (error) {
    return { ok: false, error: toAppError(error).message }
  }
}

const checkoutSchema = z.object({ flatId: uuid, dueId: uuid })

/**
 * Starts an online payment.
 *
 * The amount is read from the charge on the server — the browser only names
 * which charge is being paid, never how much it is worth.
 */
export async function startCheckoutAction(
  input: unknown,
): Promise<ActionResult<{ redirectUrl: string }>> {
  const parsed = checkoutSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  try {
    const session = await requireSession()
    const belongs = session.memberships.flats.some(
      (flat) => flat.flatId === parsed.data.flatId,
    )
    if (!belongs) return { ok: false, error: 'You are not a resident of that flat.' }

    const result = await startCheckout(session.userId, parsed.data)
    return { ok: true, data: { redirectUrl: result.redirectUrl } }
  } catch (error) {
    return { ok: false, error: toAppError(error).message }
  }
}
