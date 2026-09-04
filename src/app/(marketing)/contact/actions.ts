'use server'

import { z } from 'zod'
import { headers } from 'next/headers'
import { rateLimit } from '@/lib/rate-limit'
import { bdPhone, email } from '@/lib/validation/common'
import type { ActionResult } from '@/types'

/**
 * The marketing contact form.
 *
 * Validation moved here from the client in Phase 14. Zod is 14kB of
 * JavaScript, and shipping it to every visitor of a public page to check an
 * email address is a poor trade — the server has to check anyway, and the
 * browser's own `type="email"` catches the common mistake for free.
 */
const contactSchema = z.object({
  name: z.string().trim().min(2, 'Tell us who to reply to.').max(120),
  email,
  phone: bdPhone,
  units: z.string().trim().min(1, 'Pick a range.').max(40),
  message: z
    .string()
    .trim()
    .min(10, 'A sentence or two about your building is enough.')
    .max(2000),
})

export async function submitEnquiry(input: unknown): Promise<ActionResult<null>> {
  const forwarded = headers().get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() ?? 'unknown'

  // A public form with no session needs its own brake.
  const limit = rateLimit(`contact:${ip}`, 5, 15 * 60_000)
  if (!limit.allowed) {
    return {
      ok: false,
      error: 'Too many messages from here. Try again in a few minutes.',
    }
  }

  const parsed = contactSchema.safeParse(input)

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || 'form'
      ;(fieldErrors[key] ??= []).push(issue.message)
    }
    return { ok: false, error: 'Some fields need fixing.', fieldErrors }
  }

  // Phase 11's mailer takes over here once a sales address is configured.
  console.info('[contact] enquiry from', parsed.data.email, `(${parsed.data.units})`)

  return { ok: true, data: null }
}
