import Link from 'next/link'
import {
  Facebook,
  Instagram,
  Linkedin,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Youtube,
} from 'lucide-react'
import { footerNav, site } from '@/lib/site'
import { getTranslations } from '@/lib/i18n'
import { Logo } from './logo'
import { InstallApp } from './install-app'

/**
 * The footer.
 *
 * Contact details are real and the trade licence is asterisks until one is
 * issued — a made-up number on a page that takes rent would be worse than an
 * obvious placeholder.
 */
const SOCIAL_ICONS = {
  Facebook,
  Instagram,
  LinkedIn: Linkedin,
  YouTube: Youtube,
} as const

export function SiteFooter() {
  const { t } = getTranslations()

  return (
    <footer className="rule mt-26 bg-surface">
      <div className="container grid gap-12 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="max-w-xs">
          <Logo />
          <p className="mt-4 text-sm leading-relaxed text-muted">{t.footer.tagline}</p>

          <ul className="mt-5 space-y-2.5">
            <li>
              <a
                href={`mailto:${site.contact.email}`}
                className="flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink"
              >
                <Mail className="size-4 shrink-0" aria-hidden />
                {site.contact.email}
              </a>
            </li>
            <li>
              <a
                href={`tel:${site.contact.phone.replace(/\s|-/g, '')}`}
                className="flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink"
              >
                <Phone className="size-4 shrink-0" aria-hidden />
                {site.contact.phone}
              </a>
            </li>
            <li className="flex items-center gap-2 text-sm text-muted">
              <MapPin className="size-4 shrink-0" aria-hidden />
              {site.contact.address}
            </li>
            <li className="flex items-center gap-2 text-sm text-muted">
              <ShieldCheck className="size-4 shrink-0" aria-hidden />
              {t.footer.tradeLicence}: {site.tradeLicence}
            </li>
          </ul>

          {/*
            The install offer sits with the brand, not in a link list. It is not
            a page you can navigate to — it either appears because the browser
            supports installing, or it renders nothing at all.
          */}
          <div className="mt-5">
            <InstallApp />
          </div>

          <ul className="mt-5 flex gap-2">
            {site.social.map((profile) => {
              const Icon = SOCIAL_ICONS[profile.label as keyof typeof SOCIAL_ICONS]
              if (!Icon) return null

              return (
                <li key={profile.label}>
                  <a
                    href={profile.href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={profile.label}
                    className="inline-flex size-9 items-center justify-center rounded-control border border-line text-muted transition-colors hover:border-ink/25 hover:text-ink"
                  >
                    <Icon className="size-4" aria-hidden />
                  </a>
                </li>
              )
            })}
          </ul>
        </div>

        {footerNav.map((group) => (
          <nav key={group.heading} aria-label={group.heading}>
            <h2 className="text-sm font-semibold text-ink">{group.heading}</h2>
            <ul className="mt-4 space-y-2.5">
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted transition-colors hover:text-ink"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="rule">
        <div className="container flex flex-col gap-4 py-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted">
            © {new Date().getFullYear()} {site.name}. {t.footer.developedBy}{' '}
            <a
              href={site.ownerProfile}
              target="_blank"
              rel="noreferrer"
              className="text-ink underline-offset-4 hover:underline"
            >
              {site.owner}
            </a>
            .
          </p>
          <ul className="flex flex-wrap gap-5">
            <li>
              <Link href="/privacy" className="text-xs text-muted hover:text-ink">
                {t.footer.privacy}
              </Link>
            </li>
            <li>
              <Link href="/terms" className="text-xs text-muted hover:text-ink">
                {t.footer.terms}
              </Link>
            </li>
            <li>
              <Link href="/cookies" className="text-xs text-muted hover:text-ink">
                {t.footer.cookies}
              </Link>
            </li>
            <li>
              <Link href="/refund" className="text-xs text-muted hover:text-ink">
                Refunds
              </Link>
            </li>
            <li>
              <Link href="/contact" className="text-xs text-muted hover:text-ink">
                {t.footer.support}
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  )
}
