import Link from 'next/link'
import { requireSession } from '@/lib/auth/session'
import { permissionContext, sessionRole } from '@/lib/auth/guards'
import { PermissionProvider } from '@/components/providers/permission-provider'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { Logo } from '@/components/layout/logo'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { LocaleToggle } from '@/components/layout/locale-toggle'
import { MobileNav } from '@/components/layout/mobile-nav'
import { MobileMenuProvider, MobileMenuButton } from '@/components/layout/mobile-menu'
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
      <MobileMenuProvider>
        <div className="flex min-h-dvh flex-col">
          {/*
            `sticky` is already a positioned element, so the search results hang
            from this header without needing `relative` as well — and adding it
            would have silently cancelled the stickiness, since the later class
            wins and the bar would scroll away with the page.
          */}
          <header className="sticky top-0 z-50 border-b border-line bg-paper/85 backdrop-blur-md">
            {/*
              `flex-wrap` with a minimum height rather than a fixed one: the
              open search field claims a full-width row below `sm`, and the bar
              grows to hold it instead of the field spilling out. At every other
              time nothing wraps and the height is what it always was.
            */}
            <div className="mx-auto flex min-h-[4.5rem] max-w-[1600px] flex-wrap items-center justify-between gap-x-4 gap-y-0 px-4 py-2 sm:flex-nowrap sm:px-5 sm:py-0">
              <Logo href="/dashboard" />

              {/*
              Search, bell, menu — and the avatar, which moves inside the drawer
              on the narrowest phones. Four targets is what fits on 360px
              without them touching; the theme and language switches live in the
              profile menu below `sm` rather than competing for this row.
            */}
              {/*
                flex-1 so the open field has room, justify-end so the icons stay
                pinned right when it is closed, flex-wrap so the field can drop
                to a row of its own on a phone rather than squeezing the icons
                off the bar.
              */}
              <div className="flex flex-1 flex-wrap items-center justify-end gap-1 sm:flex-nowrap sm:gap-2">
                <GlobalSearch />
                <NotificationBell notifications={notifications} unread={unread} />
                <div className="hidden sm:block">
                  <LocaleToggle current={locale} />
                </div>
                <div className="hidden sm:block">
                  <ThemeToggle />
                </div>
                <div className="hidden sm:block">
                  <ProfileMenu
                    name={session.profile?.full_name ?? session.email}
                    email={session.email}
                    role={roleLabels[role]}
                    phoneVerified={session.isPhoneVerified}
                    avatarUrl={session.profile?.avatar_url}
                    locale={locale}
                  />
                </div>

                <MobileMenuButton />
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
      </MobileMenuProvider>
    </PermissionProvider>
  )
}
