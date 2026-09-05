/**
 * Which language the interface is in.
 *
 * Bangla and English only, and neither is a default in the marketing sense —
 * roughly half the people this is built for would rather read Bangla, and the
 * other half type unit numbers and amounts in English all day. The choice is
 * remembered in a cookie so it survives sign-out, because the language is a
 * property of the person's eyes, not of their account.
 */

export const LOCALES = ['en', 'bn'] as const
export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'en'
export const LOCALE_COOKIE = 'hc_locale'

/** A year: long enough that nobody is asked twice. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

/** Reads a locale from anything — a cookie, a header, a form field. */
export function parseLocale(value: string | null | undefined): Locale {
  if (isLocale(value)) return value

  // `bn-BD`, `bn_BD`, `en-GB` all resolve to the language.
  const language = value?.split(/[-_]/)[0]?.toLowerCase()
  return isLocale(language) ? language : DEFAULT_LOCALE
}

export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  bn: 'বাংলা',
}
