'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireSession } from '@/lib/auth/session'
import { savePreference } from '@/services/notifications.service'
import { markAllRead, markRead } from '@/services/notifications.service'
import { toAppError } from '@/lib/errors'
import type { ActionResult } from '@/types'

const preferenceSchema = z.object({
  event: z.string().trim().min(3).max(60),
  email: z.coerce.boolean(),
  sms: z.coerce.boolean(),
  push: z.coerce.boolean(),
})

/**
 * Saving a preference is the one write a person makes about their own
 * settings. In-app is not offered as a toggle — the bell is the record, and
 * turning it off would lose the history rather than quieten anything.
 */
export async function savePreferenceAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = preferenceSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That setting could not be saved.' }

  try {
    const session = await requireSession()
    await savePreference(session.userId, parsed.data.event, {
      in_app: true,
      email: parsed.data.email,
      sms: parsed.data.sms,
      push: parsed.data.push,
    })
    revalidatePath('/settings/notifications')
    return { ok: true, data: null }
  } catch (error) {
    return { ok: false, error: toAppError(error).message }
  }
}

export async function markReadAction(ids: string[]): Promise<ActionResult<null>> {
  try {
    await requireSession()
    await markRead(ids)
    revalidatePath('/', 'layout')
    return { ok: true, data: null }
  } catch (error) {
    return { ok: false, error: toAppError(error).message }
  }
}

export async function markAllReadAction(): Promise<ActionResult<null>> {
  try {
    await requireSession()
    await markAllRead()
    revalidatePath('/', 'layout')
    return { ok: true, data: null }
  } catch (error) {
    return { ok: false, error: toAppError(error).message }
  }
}
