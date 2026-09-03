'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { assertPermission } from '@/lib/auth/guards'
import { requireSession } from '@/lib/auth/session'
import { getBuilding } from '@/services/buildings.service'
import { getFlat } from '@/services/flats.service'
import { toAppError } from '@/lib/errors'
import {
  blockVisitor,
  cancelPreApproval,
  denyEntry,
  findByCode,
  liftBlock,
  logEntry,
  markExit,
  preApprove,
} from '@/services/visitors.service'
import { bdPhone, uuid } from '@/lib/validation/common'
import type { ActionResult } from '@/types'

/**
 * Gate actions.
 *
 * The guard's three — log in, mark out, turn away — are scoped to the
 * building's organization through `visitor.log`. Pre-approving is a
 * resident's act and is checked against their own flat membership instead:
 * a guard must not be able to approve a guest for a flat.
 */

const kind = z.enum(['guest', 'courier', 'service', 'staff', 'other'])

function invalid(error: z.ZodError): Extract<ActionResult<never>, { ok: false }> {
  const fieldErrors: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form'
    ;(fieldErrors[key] ??= []).push(issue.message)
  }
  return { ok: false, error: 'Some fields need fixing.', fieldErrors }
}

function refresh() {
  revalidatePath('/gate')
  revalidatePath('/visitors')
}

async function assertGate(buildingId: string) {
  const building = await getBuilding(buildingId)
  return assertPermission('visitor.log', { orgId: building.org_id })
}

const entrySchema = z.object({
  buildingId: uuid,
  flatId: uuid.optional().or(z.literal('').transform(() => undefined)),
  fullName: z.string().trim().min(2, 'Write their name.').max(120),
  phone: bdPhone.optional().or(z.literal('').transform(() => undefined)),
  kind,
  purpose: z.string().trim().max(200).optional(),
  vehicle: z.string().trim().max(40).optional(),
  idNote: z.string().trim().max(80).optional(),
  visitorId: uuid.optional(),
})

export async function logEntryAction(
  input: unknown,
): Promise<ActionResult<{ id: string; name: string }>> {
  const parsed = entrySchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  try {
    const session = await assertGate(parsed.data.buildingId)
    const visitor = await logEntry(session.userId, parsed.data)
    refresh()
    return { ok: true, data: { id: visitor.id, name: visitor.full_name } }
  } catch (error) {
    return { ok: false, error: toAppError(error).message }
  }
}

export async function markExitAction(
  buildingId: string,
  visitorId: string,
): Promise<ActionResult<null>> {
  try {
    const session = await assertGate(buildingId)
    await markExit(session.userId, visitorId)
    refresh()
    return { ok: true, data: null }
  } catch (error) {
    return { ok: false, error: toAppError(error).message }
  }
}

const denySchema = z.object({
  buildingId: uuid,
  fullName: z.string().trim().min(2).max(120),
  phone: bdPhone.optional().or(z.literal('').transform(() => undefined)),
  reason: z.string().trim().min(3, 'Say why they were turned away.').max(200),
})

export async function denyEntryAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = denySchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  try {
    const session = await assertGate(parsed.data.buildingId)
    await denyEntry(session.userId, parsed.data)
    refresh()
    return { ok: true, data: null }
  } catch (error) {
    return { ok: false, error: toAppError(error).message }
  }
}

/** Looks a code up without logging anyone in — the guard confirms first. */
export async function lookUpCodeAction(
  buildingId: string,
  code: string,
): Promise<
  ActionResult<{
    id: string
    name: string
    unit: string | null
    purpose: string | null
  } | null>
> {
  try {
    await assertGate(buildingId)
    const visitor = await findByCode(buildingId, code)

    return {
      ok: true,
      data: visitor
        ? {
            id: visitor.id,
            name: visitor.full_name,
            unit: visitor.unitNumber,
            purpose: visitor.purpose,
          }
        : null,
    }
  } catch (error) {
    return { ok: false, error: toAppError(error).message }
  }
}

const approveSchema = z.object({
  flatId: uuid,
  fullName: z.string().trim().min(2, 'Write their name.').max(120),
  phone: bdPhone.optional().or(z.literal('').transform(() => undefined)),
  kind,
  purpose: z.string().trim().max(200).optional(),
  expectedAt: z.string().optional(),
})

/** A resident approving a guest for their own flat. */
export async function preApproveAction(
  input: unknown,
): Promise<ActionResult<{ code: string; expiresAt: string }>> {
  const parsed = approveSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  try {
    const session = await requireSession()
    const belongs = session.memberships.flats.some(
      (flat) => flat.flatId === parsed.data.flatId,
    )
    if (!belongs)
      return { ok: false, error: 'You can only approve guests for your own flat.' }

    const flat = await getFlat(parsed.data.flatId)
    const result = await preApprove(session.userId, {
      ...parsed.data,
      buildingId: flat.building_id,
      expectedAt: parsed.data.expectedAt || undefined,
    })

    refresh()
    return { ok: true, data: { code: result.code, expiresAt: result.expiresAt } }
  } catch (error) {
    return { ok: false, error: toAppError(error).message }
  }
}

export async function cancelPreApprovalAction(
  visitorId: string,
): Promise<ActionResult<null>> {
  try {
    const session = await requireSession()
    await cancelPreApproval(session.userId, visitorId)
    refresh()
    return { ok: true, data: null }
  } catch (error) {
    return { ok: false, error: toAppError(error).message }
  }
}

const blockSchema = z.object({
  buildingId: uuid,
  fullName: z.string().trim().min(2).max(120),
  phone: bdPhone.optional().or(z.literal('').transform(() => undefined)),
  reason: z.string().trim().min(5, 'Say why they are being blocked.').max(300),
})

export async function blockVisitorAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = blockSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  try {
    const building = await getBuilding(parsed.data.buildingId)
    const session = await assertPermission('visitor.block', { orgId: building.org_id })
    await blockVisitor(session.userId, parsed.data)
    refresh()
    return { ok: true, data: null }
  } catch (error) {
    return { ok: false, error: toAppError(error).message }
  }
}

export async function liftBlockAction(
  buildingId: string,
  blockId: string,
): Promise<ActionResult<null>> {
  try {
    const building = await getBuilding(buildingId)
    const session = await assertPermission('visitor.block', { orgId: building.org_id })
    await liftBlock(session.userId, blockId)
    refresh()
    return { ok: true, data: null }
  } catch (error) {
    return { ok: false, error: toAppError(error).message }
  }
}
