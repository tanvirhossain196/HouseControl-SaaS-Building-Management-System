import Link from 'next/link'
import { Mail, MapPin, Phone, ShieldCheck } from 'lucide-react'
import { footerNav, site } from '@/lib/site'
import { Logo } from './logo'

/**
 * The footer.
 *
 * Contact details are real and the trade licence is asterisks until one is
 * issued — a made-up number on a page that takes rent would be worse than an
 * obvious placeholder.
 */
export function SiteFooter() {
  return (
    <footer className="rule mt-26 bg-surface">
      <div className="container grid gap-12 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="max-w-xs">
          <Logo />
          <p className="mt-4 text-sm leading-relaxed text-muted">{site.tagline}</p>

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
              Trade licence: {site.tradeLicence}
            </li>
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
            © {new Date().getFullYear()} {site.name}. Developed by{' '}
            <span className="text-ink">{site.owner}</span>.
          </p>
          <ul className="flex flex-wrap gap-5">
            <li>
              <Link href="/privacy" className="text-xs text-muted hover:text-ink">
                Privacy
              </Link>
            </li>
            <li>
              <Link href="/terms" className="text-xs text-muted hover:text-ink">
                Terms
              </Link>
            </li>
            <li>
              <Link href="/cookies" className="text-xs text-muted hover:text-ink">
                Cookies
              </Link>
            </li>
            <li>
              <Link href="/contact" className="text-xs text-muted hover:text-ink">
                Support
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  )
}
