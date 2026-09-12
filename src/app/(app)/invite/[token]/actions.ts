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
    if (!token || !/^[A-Za-z0-9_-]{20,200}$/.test(token)) {
      return { ok: false, error: 'This invite link is invalid.' }
    }

    const session = await requireSession()
    await acceptInvite(session.userId, session.email, token)
    revalidatePath('/', 'layout')
    return { ok: true, data: null }
  } catch (error) {
    const databaseError = error as { code?: string; message?: string }
    const rawMessage = databaseError?.message ?? ''

    if (
      databaseError?.code === '23514' ||
      rawMessage.toLowerCase().includes('rent shares') ||
      rawMessage.toLowerCase().includes('flat rent')
    ) {
      return {
        ok: false,
        error:
          'This member share is higher than the remaining flat rent. Ask the moderator to reduce the existing share or create a new invite with a smaller amount.',
      }
    }

    return { ok: false, error: toAppError(error).message }
  }
}
