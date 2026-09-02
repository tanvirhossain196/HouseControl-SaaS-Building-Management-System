'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { assertPermission } from '@/lib/auth/guards'
import { createInvite, revokeInvite } from '@/services/invites.service'
import { toAppError } from '@/lib/errors'
import { email, money, uuid } from '@/lib/validation/common'
import type { ActionResult } from '@/types'

const inviteSchema = z.object({
  orgId: uuid,
  email,
  role: z.enum(['admin', 'moderator', 'member', 'guard']),
  flatId: uuid.optional().or(z.literal('').transform(() => undefined)),
  rentShare: z.coerce.number().pipe(money).optional(),
})

/**
 * Invite someone into the organization. The permission is checked against the
 * organization named in the form, not "anywhere" — an admin of one building
 * cannot invite themselves into another.
 */
export async function inviteMember(
  input: unknown,
): Promise<ActionResult<{ link: string }>> {
  const parsed = inviteSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || 'form'
      ;(fieldErrors[key] ??= []).push(issue.message)
    }
    return { ok: false, error: 'Some fields need fixing.', fieldErrors }
  }

  try {
    const session = await assertPermission('resident.invite', {
      orgId: parsed.data.orgId,
    })
    const { link } = await createInvite(session.userId, parsed.data)
    revalidatePath('/admin/team')
    return { ok: true, data: { link } }
  } catch (error) {
    return { ok: false, error: toAppError(error).message }
  }
}

export async function revoke(
  inviteId: string,
  orgId: string,
): Promise<ActionResult<null>> {
  try {
    const session = await assertPermission('resident.invite', { orgId })
    await revokeInvite(session.userId, inviteId)
    revalidatePath('/admin/team')
    return { ok: true, data: null }
  } catch (error) {
    return { ok: false, error: toAppError(error).message }
  }
}
