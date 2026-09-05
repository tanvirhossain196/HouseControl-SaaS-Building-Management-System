import Link from 'next/link'
import { requireSession } from '@/lib/auth/session'
import { permissionContext, sessionRole } from '@/lib/auth/guards'
import { PermissionProvider } from '@/components/providers/permission-provider'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { Logo } from '@/components/layout/logo'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { LocaleToggle } from '@/components/layout/locale-toggle'
import { MobileNav } from '@/components/layout/mobile-nav'
import { getLocale } from '@/lib/i18n'
import { GlobalSearch } from '@/components/search/global-search'
import { NotificationBell } from '@/components/notifications/notification-bell'
import { listNotifications, unreadCount } from '@/services/notifications.service'
import { ProfileMenu } from '@/components/layout/profile-menu'
import { roleLabels } from '@/lib/auth/permissions'

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
  const locale = getLocale()

  const [notifications, unread] = await Promise.all([
    listNotifications(15).catch(() => []),
    unreadCount().catch(() => 0),
  ])

  return (
    <PermissionProvider value={{ ...permissionContext(session), role }}>
      <div className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-50 border-b border-line bg-paper/85 backdrop-blur-md">
          <div className="mx-auto flex h-[4.5rem] max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-5">
            <Logo href="/dashboard" />

            {/*
              Two controls on a phone — the bell and your own face — because
              anything more crowds a 360px header. The theme and language
              switches move inside the profile menu below `sm`, where they are
              one tap away rather than two competing for the same row.
            */}
            <div className="flex items-center gap-2 sm:gap-3">
              <NotificationBell notifications={notifications} unread={unread} />
              <div className="hidden sm:block">
                <LocaleToggle current={locale} />
              </div>
              <div className="hidden sm:block">
                <ThemeToggle />
              </div>
              <ProfileMenu
                name={session.profile?.full_name ?? session.email}
                email={session.email}
                role={roleLabels[role]}
                phoneVerified={session.isPhoneVerified}
                avatarUrl={session.profile?.avatar_url}
                locale={locale}
              />
            </div>
          </div>
        </header>

        {/*
          `items-start` is what lets the sidebar be sticky: in a stretched
          flex row it would be forced to the full height of the content and
          have nothing to stick to.
        */}
        <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col items-start lg:flex-row">
          <AppSidebar role={role} />
          <main
            id="main"
            // The bottom padding clears the fixed mobile bar; without it the
            // last row of every table sits under it.
            className="min-w-0 flex-1 px-4 pb-24 pt-6 sm:px-5 sm:pt-8 lg:px-8 lg:pb-12 lg:pt-10"
          >
            {children}
          </main>
        </div>

        <MobileNav />
      </div>
    </PermissionProvider>
  )
}
