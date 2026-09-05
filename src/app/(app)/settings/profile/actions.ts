'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireSession } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { toAppError } from '@/lib/errors'
import { writeAuditLog } from '@/services/audit.service'
import type { ActionResult } from '@/types'

const profileSchema = z.object({
  fullName: z.string().trim().min(2, 'Your name, as people should see it.').max(120),
  locale: z.enum(['en', 'bn']).default('en'),
})

/**
 * Editing your own profile.
 *
 * The email is not here: changing it changes what you sign in with, so it
 * goes through Supabase's own confirmation flow rather than a text field.
 * The phone is not here either — it is verified by code on
 * `/onboarding/phone`, and a profile form that could set it silently would
 * make that verification meaningless.
 */
export async function updateProfileAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = profileSchema.safeParse(input)

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || 'form'
      ;(fieldErrors[key] ??= []).push(issue.message)
    }
    return { ok: false, error: 'Some fields need fixing.', fieldErrors }
  }

  try {
    const session = await requireSession()
    const supabase = createServerSupabase()

    const { error } = await supabase
      .from('profiles')
      .update({ full_name: parsed.data.fullName, locale: parsed.data.locale })
      .eq('id', session.userId)

    if (error) throw error

    await writeAuditLog({
      actorId: session.userId,
      action: 'profile.updated',
      entityType: 'user',
      entityId: session.userId,
      after: { fullName: parsed.data.fullName },
    })

    revalidatePath('/', 'layout')
    return { ok: true, data: null }
  } catch (error) {
    return { ok: false, error: toAppError(error).message }
  }
}

/**
 * Stores the URL of a photo already uploaded to Storage, or clears it.
 *
 * The upload itself happens in the browser: sending a 2MB image through a
 * server action would base64-encode it into the request body, a third larger
 * than the file. Passing `null` removes the photo without touching the object
 * in the bucket — an orphaned file costs a few kilobytes, and deleting the
 * wrong one costs somebody their photo.
 */
export async function saveAvatarAction(url: string | null): Promise<ActionResult<null>> {
  const parsed =
    url === null
      ? { success: true as const, data: null }
      : z.string().url().safeParse(url)

  if (!parsed.success)
    return { ok: false, error: 'That does not look like an image address.' }

  try {
    const session = await requireSession()
    const supabase = createServerSupabase()

    const { error } = await supabase
      .from('profiles')
      .update({ avatar_url: url })
      .eq('id', session.userId)

    if (error) throw error

    revalidatePath('/', 'layout')
    return { ok: true, data: null }
  } catch (error) {
    return { ok: false, error: toAppError(error).message }
  }
}
