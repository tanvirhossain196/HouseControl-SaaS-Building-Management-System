'use server'

import { revalidatePath } from 'next/cache'
import { requireSession } from '@/lib/auth/session'
import { acceptInvite } from '@/services/invites.service'
import { toAppError } from '@/lib/errors'
import type { ActionResult } from '@/types'

/**
 * Accepting is the one write a person makes about their own role. The service
 * re-checks that the invite matches their address — the page's check is only
 * there to explain the situation early.
 */
export async function acceptInviteAction(token: string): Promise<ActionResult<null>> {
  try {
    const session = await requireSession()
    await acceptInvite(session.userId, session.email, token)
    revalidatePath('/', 'layout')
    return { ok: true, data: null }
  } catch (error) {
    return { ok: false, error: toAppError(error).message }
  }
}
