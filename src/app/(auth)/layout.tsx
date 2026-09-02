import Link from 'next/link'
import { Logo } from '@/components/layout/logo'
import { ThemeToggle } from '@/components/layout/theme-toggle'

/**
 * Auth pages get no marketing nav. One column, one task, one way out —
 * the person is here to sign in, not to browse.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="container flex h-16 items-center justify-between">
        <Logo />
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link href="/" className="text-sm text-muted transition-colors hover:text-ink">
            Back to site
          </Link>
        </div>
      </header>
      <main id="main" className="flex flex-1 items-center justify-center px-5 py-10">
        <div className="w-full max-w-md">{children}</div>
      </main>
      <footer className="container py-6">
        <p className="text-center text-xs text-muted">
          Protected by verified sign-in.{' '}
          <Link href="/privacy" className="hover:text-ink">
            Privacy
          </Link>{' '}
          ·{' '}
          <Link href="/terms" className="hover:text-ink">
            Terms
          </Link>
        </p>
      </footer>
    </div>
  )
}
