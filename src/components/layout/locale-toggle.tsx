'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setLocaleAction } from '@/lib/i18n/actions'
import { LOCALE_NAMES, LOCALES, type Locale } from '@/lib/i18n/locales'
import { cn } from '@/lib/utils'

/**
 * The language switch.
 *
 * Both options are always visible rather than hidden behind a dropdown: a
 * person who cannot read the current language cannot read the label on a
 * menu that would reveal the other one.
 */
export function LocaleToggle({ current }: { current: Locale }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <div
      role="group"
      aria-label={LOCALE_NAMES[current] === 'বাংলা' ? 'ভাষা' : 'Language'}
      className="inline-flex items-center rounded-control border border-line p-0.5"
    >
      {LOCALES.map((locale) => {
        const active = locale === current

        return (
          <button
            key={locale}
            type="button"
            lang={locale}
            aria-pressed={active}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await setLocaleAction(locale)
                router.refresh()
              })
            }
            className={cn(
              'rounded-tile px-2 py-1 text-xs font-medium transition-colors disabled:opacity-60',
              active ? 'bg-primary text-primary-fg' : 'text-muted hover:text-ink',
            )}
          >
            {locale === 'bn' ? 'বাংলা' : 'EN'}
          </button>
        )
      })}
    </div>
  )
}
