import { getTranslations } from '@/lib/i18n'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { BackToTop } from '@/components/layout/back-to-top'

/** Chrome for the public site: full nav, footer, back-to-top. */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const { locale, t } = getTranslations()

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader t={t} locale={locale} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
      <BackToTop />
    </div>
  )
}
