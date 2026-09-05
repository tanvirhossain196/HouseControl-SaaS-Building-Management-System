import { cookies } from 'next/headers'
import { en, type Dictionary } from './en'
import { bn } from './bn'
import { DEFAULT_LOCALE, LOCALE_COOKIE, parseLocale, type Locale } from './locales'

export * from './locales'
export type { Dictionary }

const DICTIONARIES: Record<Locale, Dictionary> = { en, bn }

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE]
}

/**
 * The language for this request, from the cookie.
 *
 * Server-side only. Reading it marks the route dynamic, which every page
 * behind sign-in already is — and the marketing pages become dynamic too,
 * which is the price of serving both languages from one URL rather than
 * duplicating every route under /bn.
 */
export function getLocale(): Locale {
  return parseLocale(cookies().get(LOCALE_COOKIE)?.value)
}

/** Convenience for a server component: the locale and its strings together. */
export function getTranslations(): { locale: Locale; t: Dictionary } {
  const locale = getLocale()
  return { locale, t: getDictionary(locale) }
}
