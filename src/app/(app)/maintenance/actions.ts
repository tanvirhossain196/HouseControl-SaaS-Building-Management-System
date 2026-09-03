'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireSession } from '@/lib/auth/session'
import { assertFlatPermission, assertPermission } from '@/lib/auth/guards'
import { getBuilding } from '@/services/buildings.service'
import { toAppError } from '@/lib/errors'
import {
  addNote,
  cancelOwnRequest,
  changeStatus,
  createRequest,
  getRequest,
} from '@/services/maintenance.service'
import { isoDate, money, uuid } from '@/lib/validation/common'
import type { ActionResult } from '@/types'

/**
 * Reporting is open to anyone who lives in the flat; moving a request along
 * is not. The split mirrors the RLS policies rather than duplicating a
 * different rule.
 */

function invalid(error: z.ZodError): Extract<ActionResult<never>, { ok: false }> {
  const fieldErrors: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form'
    ;(fieldErrors[key] ??= []).push(issue.message)
  }
  return { ok: false, error: 'Some fields need fixing.', fieldErrors }
}

function refresh(requestId?: string) {
  revalidatePath('/maintenance')
  revalidatePath('/dashboard')
  if (requestId) revalidatePath(`/maintenance/${requestId}`)
}

const CATEGORIES = [
  'electricity',
  'gas',
  'water',
  'internet',
  'cleaning',
  'security',
  'lift',
  'repair',
  'other',
] as const

const createSchema = z.object({
  buildingId: uuid,
  flatId: uuid.optional().or(z.literal('').transform(() => undefined)),
  title: z.string().trim().min(3, 'Give it a short title.').max(160),
  description: z
    .string()
    .trim()
    .min(10, 'Describe what is wrong — a sentence or two is enough.')
    .max(2000),
  category: z.enum(CATEGORIES).default('repair'),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
})

export async function reportProblemAction(
  input: unknown,
): Promise<ActionResult<{ id: string; reference: string }>> {
  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  try {
    const session = await requireSession()

    // Reporting about a flat requires living in it or managing it; a
    // building-wide report requires belonging to the organization.
    if (parsed.data.flatId) {
      const belongs = session.memberships.flats.some(
        (flat) => flat.flatId === parsed.data.flatId,
      )
      if (!belongs) {
        await assertFlatPermission(parsed.data.flatId, 'maintenance.create')
      }
    }

    const request = await createRequest(session.userId, parsed.data)
    refresh()
    return { ok: true, data: { id: request.id, reference: request.reference } }
  } catch (error) {
    return { ok: false, error: toAppError(error).message }
  }
}

const statusSchema = z.object({
  requestId: uuid,
  status: z.enum(['open', 'in_progress', 'resolved', 'cancelled']),
  note: z.string().trim().max(1000).optional(),
  resolution: z.string().trim().max(1000).optional(),
  cost: z.coerce.number().pipe(money).optional(),
  assignTo: uuid.optional().or(z.literal('').transform(() => undefined)),
  scheduledFor: isoDate.optional().or(z.literal('').transform(() => undefined)),
})

/** Assigning, scheduling, resolving — the work side. */
export async function changeStatusAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = statusSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  try {
    const request = await getRequest(parsed.data.requestId)
    const building = await getBuilding(request.building_id)

    const permission =
      parsed.data.status === 'resolved' ? 'maintenance.resolve' : 'maintenance.assign'

    const session = request.flat_id
      ? await assertFlatPermission(request.flat_id, permission)
      : await assertPermission(permission, { orgId: building.org_id })

    await changeStatus(session.userId, {
      ...parsed.data,
      assignTo: parsed.data.assignTo ?? undefined,
      scheduledFor: parsed.data.scheduledFor ?? undefined,
    })

    refresh(parsed.data.requestId)
    return { ok: true, data: null }
  } catch (error) {
    return { ok: false, error: toAppError(error).message }
  }
}

const noteSchema = z.object({
  requestId: uuid,
  note: z.string().trim().min(1, 'Write something first.').max(1000),
})

export async function addNoteAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = noteSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  try {
    const session = await requireSession()
    await addNote(session.userId, parsed.data.requestId, parsed.data.note)
    refresh(parsed.data.requestId)
    return { ok: true, data: null }
  } catch (error) {
    return { ok: false, error: toAppError(error).message }
  }
}

const withdrawSchema = z.object({
  requestId: uuid,
  reason: z.string().trim().min(3, 'Say why in a few words.').max(300),
})

/** The reporter withdrawing their own complaint. */
export async function withdrawRequestAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = withdrawSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  try {
    const session = await requireSession()
    await cancelOwnRequest(session.userId, parsed.data.requestId, parsed.data.reason)
    refresh(parsed.data.requestId)
    return { ok: true, data: null }
  } catch (error) {
    return { ok: false, error: toAppError(error).message }
  }
}
