import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { getTranslations } from '@/lib/i18n'
import { BuildingPanel } from './building-panel'

export function Hero() {
  const { t } = getTranslations()

  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="grid-lines pointer-events-none absolute inset-0 opacity-[0.6] [mask-image:radial-gradient(70%_60%_at_50%_0%,black,transparent)]"
      />
      <div className="container relative grid gap-14 py-16 md:py-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-16">
        <div className="max-w-xl">
          <h1 className="text-display-lg text-ink">{t.hero.title}</h1>
          <p className="mt-6 max-w-[56ch] text-lead text-muted">{t.hero.body}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/sign-up" className={buttonVariants({ size: 'lg' })}>
              {t.hero.primary}
            </Link>
            <Link
              href="/#how-it-works"
              className={buttonVariants({ variant: 'outline', size: 'lg' })}
            >
              {t.hero.secondary}
            </Link>
          </div>
          <p className="mt-5 text-sm text-muted">{t.hero.note}</p>
        </div>

        <div className="lg:pl-4">
          <BuildingPanel />
        </div>
      </div>
    </section>
  )
}
