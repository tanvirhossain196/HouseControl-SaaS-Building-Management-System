import Link from 'next/link'
import { Logo } from '@/components/layout/logo'
import { SiteFooter } from '@/components/layout/site-footer'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { LocaleToggle } from '@/components/layout/locale-toggle'
import { getTranslations } from '@/lib/i18n'

/**
 * Auth pages get no marketing nav. One column, one task, one way out —
 * the person is here to sign in, not to browse.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { locale, t } = getTranslations()

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="container flex h-[4.5rem] items-center justify-between">
        <Logo />
        <div className="flex items-center gap-3">
          <LocaleToggle current={locale} />
          <ThemeToggle />
          <Link href="/" className="text-sm text-muted transition-colors hover:text-ink">
            {t.common.backToSite}
          </Link>
        </div>
      </header>
      <main id="main" className="flex flex-1 items-center justify-center px-5 py-10">
        <div className="w-full max-w-md">{children}</div>
      </main>
      {/* The same footer as the public site: someone deciding whether to
          trust this with their building's rent should be able to see who
          built it from the page they are signing up on. */}
      <SiteFooter />
    </div>
  )
}
