import Link from 'next/link'
import { footerNav, site } from '@/lib/site'
import { Logo } from './logo'

export function SiteFooter() {
  return (
    <footer className="rule mt-26 bg-surface">
      <div className="container grid gap-12 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="max-w-xs">
          <Logo />
          <p className="mt-4 text-sm leading-relaxed text-muted">{site.tagline}</p>
          <p className="mt-4 text-sm text-muted">{site.contact.address}</p>
          <a
            href={`mailto:${site.contact.email}`}
            className="mt-1 inline-block text-sm text-primary hover:underline"
          >
            {site.contact.email}
          </a>
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
            © {new Date().getFullYear()} {site.name}. Built for buildings in Bangladesh.
          </p>
          <ul className="flex gap-5">
            {site.social.map((s) => (
              <li key={s.label}>
                <a
                  href={s.href}
                  rel="noopener noreferrer"
                  target="_blank"
                  className="text-xs text-muted transition-colors hover:text-ink"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  )
}
