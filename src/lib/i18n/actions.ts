'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, parseLocale } from './locales'

/**
 * Switches the interface language.
 *
 * A server action rather than `document.cookie`, so the cookie is written
 * with the same flags as every other one we set and the page re-renders with
 * the new strings in the same round trip. Writing it from the browser would
 * mean the server rendered English and the client corrected it a moment
 * later, which is a visible flicker on a slow connection.
 */
export async function setLocaleAction(value: string): Promise<void> {
  const locale = parseLocale(value)

  cookies().set(LOCALE_COOKIE, locale, {
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: 'lax',
    path: '/',
    // Not httpOnly: no secret is involved, and a future client component may
    // want to read it without another round trip.
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
  })

  revalidatePath('/', 'layout')
}
