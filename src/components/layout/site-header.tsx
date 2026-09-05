'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import { mainNav } from '@/lib/site'
import { LocaleToggle } from './locale-toggle'
import type { Dictionary, Locale } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import { Logo } from './logo'
import { ThemeToggle } from './theme-toggle'

/** Tracks which landing-page section is in view so the nav can mark it as current. */
function useActiveSection(enabled: boolean) {
  const [active, setActive] = React.useState('')

  React.useEffect(() => {
    if (!enabled) return
    const ids = mainNav
      .filter((item) => item.href.includes('#'))
      .map((item) => item.href.split('#')[1]!)
    const sections = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el))

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (visible) setActive(`#${visible.target.id}`)
      },
      { rootMargin: '-45% 0px -50% 0px', threshold: [0, 0.25, 0.5] },
    )
    sections.forEach((s) => observer.observe(s))
    return () => observer.disconnect()
  }, [enabled])

  return active
}

const NAV_KEYS: Record<string, keyof Dictionary['nav']> = {
  '/#features': 'features',
  '/#how-it-works': 'howItWorks',
  '/pricing': 'pricing',
  '/faq': 'faq',
  '/about': 'about',
}

export function SiteHeader({ t, locale }: { t: Dictionary; locale: Locale }) {
  const pathname = usePathname()
  const isHome = pathname === '/'
  const activeSection = useActiveSection(isHome)
  const [open, setOpen] = React.useState(false)
  const [scrolled, setScrolled] = React.useState(false)

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  React.useEffect(() => {
    setOpen(false)
  }, [pathname])

  React.useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  const isCurrent = (href: string) => {
    if (href.startsWith('/#')) return isHome && activeSection === href.slice(1)
    return pathname === href
  }

  return (
    <header
      className={cn(
        'sticky top-0 z-50 border-b transition-colors duration-200',
        scrolled
          ? 'border-line bg-paper/85 backdrop-blur-md'
          : 'border-transparent bg-paper',
      )}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-control focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-fg"
      >
        Skip to content
      </a>

      <div className="container flex h-16 items-center justify-between gap-6">
        <Logo />

        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {mainNav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isCurrent(item.href) ? 'page' : undefined}
                  className={cn(
                    'relative rounded-control px-3 py-2 text-sm font-medium transition-colors',
                    isCurrent(item.href) ? 'text-ink' : 'text-muted hover:text-ink',
                  )}
                >
                  {t.nav[NAV_KEYS[item.href] ?? 'features'] ?? item.label}
                  {isCurrent(item.href) && (
                    <span
                      aria-hidden
                      className="absolute inset-x-3 -bottom-[7px] h-0.5 rounded-full bg-primary"
                    />
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <LocaleToggle current={locale} />
          <ThemeToggle />
          <Link href="/sign-in" className="text-sm font-medium text-muted hover:text-ink">
            {t.common.signIn}
          </Link>
          <Link href="/sign-up" className={buttonVariants({ size: 'sm' })}>
            {t.common.signUp}
          </Link>
        </div>

        <div className="flex items-center gap-1 md:hidden">
          <LocaleToggle current={locale} />
          <ThemeToggle />
          <Button
            variant="quiet"
            size="icon"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X /> : <Menu />}
          </Button>
        </div>
      </div>

      <div
        id="mobile-nav"
        hidden={!open}
        className="border-t border-line bg-paper md:hidden"
      >
        <nav aria-label="Mobile" className="container py-4">
          <ul className="flex flex-col">
            {mainNav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex min-h-12 items-center rounded-control px-2 text-[0.95rem] font-medium text-ink hover:bg-raised"
                >
                  {t.nav[NAV_KEYS[item.href] ?? 'features'] ?? item.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
            <Link
              href="/sign-in"
              className="flex min-h-12 items-center rounded-control px-2 text-[0.95rem] font-medium text-muted hover:bg-raised"
            >
              {t.common.signIn}
            </Link>
            <Link
              href="/sign-up"
              className="flex min-h-12 items-center justify-center rounded-control bg-primary px-4 text-sm font-medium text-primary-fg"
            >
              {t.common.signUp}
            </Link>
          </div>
        </nav>
      </div>
    </header>
  )
}
