import Link from 'next/link'
import { requireSession } from '@/lib/auth/session'
import { permissionContext, sessionRole } from '@/lib/auth/guards'
import { PermissionProvider } from '@/components/providers/permission-provider'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { Logo } from '@/components/layout/logo'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { SignOutButton } from '@/components/auth/sign-out-button'
import { Avatar } from '@/components/ui/avatar'

/**
 * Everything behind sign-in.
 *
 * Middleware has already turned anonymous visitors away; this layout is the
 * second lock. It also decides the sidebar, which is filtered by permission
 * rather than hand-written per role.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession()
  const role = sessionRole(session)

  return (
    <PermissionProvider value={{ ...permissionContext(session), role }}>
      <div className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-50 border-b border-line bg-paper/85 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-4 px-5">
            <Logo href="/dashboard" />
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <Link
                href="/onboarding/phone"
                className="hidden sm:block"
                aria-label="Your profile and phone number"
              >
                <Avatar name={session.profile?.full_name ?? session.email} size="sm" />
              </Link>
              <SignOutButton />
            </div>
          </div>
        </header>

        <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col lg:flex-row">
          <AppSidebar role={role} />
          <main id="main" className="min-w-0 flex-1 px-5 py-8 lg:px-8 lg:py-10">
            {children}
          </main>
        </div>
      </div>
    </PermissionProvider>
  )
}
