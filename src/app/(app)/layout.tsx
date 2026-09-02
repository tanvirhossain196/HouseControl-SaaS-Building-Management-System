import Link from 'next/link'
import { requireSession } from '@/lib/auth/session'
import { Logo } from '@/components/layout/logo'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { SignOutButton } from '@/components/auth/sign-out-button'
import { Avatar } from '@/components/ui/avatar'

/**
 * Everything behind sign-in. Middleware already redirects anonymous visitors;
 * this check is the second lock, for the case where middleware is bypassed.
 *
 * Phase 4 replaces this header with role-specific sidebars.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession()

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-50 border-b border-line bg-paper/85 backdrop-blur-md">
        <div className="container flex h-16 items-center justify-between gap-4">
          <Logo href="/dashboard" />
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              href="/onboarding/phone"
              className="hidden items-center gap-2 sm:flex"
              aria-label="Your profile"
            >
              <Avatar name={session.profile?.full_name ?? session.email} size="sm" />
            </Link>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
    </div>
  )
}
