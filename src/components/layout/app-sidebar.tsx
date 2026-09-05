'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Activity,
  BellRing,
  Building2,
  ChartNoAxesColumn,
  Coins,
  CreditCard,
  DoorOpen,
  Grid3x3,
  HelpCircle,
  Home,
  Mail,
  Menu,
  Receipt,
  Search,
  Shield,
  User,
  Users,
  Wallet,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react'
import { navigation, type NavItem } from '@/lib/auth/navigation'
import { can, roleLabels, type RoleKey } from '@/lib/auth/permissions'
import { usePermissions } from '@/components/providers/permission-provider'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const ICONS: Record<string, LucideIcon> = {
  home: Home,
  door: DoorOpen,
  search: Search,
  shield: Shield,
  building: Building2,
  grid: Grid3x3,
  users: Users,
  mail: Mail,
  receipt: Receipt,
  wallet: Wallet,
  coins: Coins,
  chart: ChartNoAxesColumn,
  wrench: Wrench,
  card: CreditCard,
  user: User,
  bell: BellRing,
  activity: Activity,
  help: HelpCircle,
}

/**
 * The sidebar.
 *
 * One tree filtered by permission, so a resident sees four links and an owner
 * sixteen from the same source.
 *
 * Behaviour by screen, and no toggle on desktop:
 *
 *   ≥1280px  always open, full labels. There is room; hiding the labels only
 *            made people guess at icons.
 *   ≥1024px  always open, narrower. Still labelled.
 *   <1024px  a drawer over the content, opened from the header and closed by
 *            Escape, the backdrop, or following a link.
 *
 * It scrolls on its own: `sticky` with its own `overflow-y`, so a long list
 * of flats does not drag the navigation off the top of the screen.
 */
export function AppSidebar({ role }: { role: RoleKey }) {
  const pathname = usePathname()
  const permissions = usePermissions()
  const [open, setOpen] = React.useState(false)

  // Close the drawer on navigation, and on Escape.
  React.useEffect(() => {
    setOpen(false)
  }, [pathname])

  React.useEffect(() => {
    if (!open) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('keydown', onKey)
    // The page behind a drawer must not scroll under it.
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [open])

  const visible = navigation
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (item.roles && !item.roles.includes(role)) return false
        if (!item.permission) return true
        return can(permissions, item.permission)
      }),
    }))
    .filter((section) => section.items.length > 0)

  const isCurrent = (item: NavItem) =>
    pathname === item.href ||
    (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`))

  const tree = (
    <nav aria-label="Sections" className="space-y-6">
      {visible.map((section) => (
        <div key={section.heading}>
          <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            {section.heading}
          </p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const Icon = ICONS[item.icon ?? ''] ?? Home
              const current = isCurrent(item)

              return (
                <li key={item.href}>
                  <Link
                    href={item.soon ? '#' : item.href}
                    aria-current={current ? 'page' : undefined}
                    aria-disabled={item.soon || undefined}
                    className={cn(
                      // `justify-start` explicitly: without it a flex row of
                      // one icon and one label centres itself once the label
                      // is short, which is what pushed the icons off to the
                      // right of the rail.
                      'flex w-full items-center justify-start gap-3 rounded-control px-3 py-2 text-sm transition-colors',
                      current
                        ? 'bg-primary-soft font-medium text-primary'
                        : 'text-muted hover:bg-raised hover:text-ink',
                      item.soon && 'pointer-events-none opacity-50',
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-left">
                      {item.label}
                    </span>
                    {item.soon && (
                      <span className="shrink-0 text-[0.65rem] font-medium text-muted">
                        soon
                      </span>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )

  return (
    <>
      {/* Narrow screens: a button in the header row, and a drawer over the page. */}
      <div className="border-b border-line px-5 py-3 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="app-sidebar-drawer"
          className="inline-flex items-center gap-2 rounded-control border border-line px-3 py-2 text-sm text-ink transition-colors hover:bg-raised"
        >
          <Menu className="size-4" aria-hidden />
          Menu
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-[80] lg:hidden">
          <div
            className="absolute inset-0 animate-fade-in bg-ink/50 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            id="app-sidebar-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Sections"
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] animate-slide-in-right flex-col border-r border-line bg-surface"
          >
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <Badge tone="primary">{roleLabels[role]}</Badge>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close the menu"
                className="inline-flex size-8 items-center justify-center rounded-control text-muted transition-colors hover:bg-raised hover:text-ink"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            {/* Its own scroll: a long menu must not scroll the page under it. */}
            <div className="min-h-0 flex-1 overflow-y-auto p-3">{tree}</div>
          </div>
        </div>
      )}

      {/*
        Desktop: always open, and sticky with its own scrollbar so the
        navigation stays put while a long table scrolls beside it.
      */}
      <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-56 shrink-0 overflow-y-auto border-r border-line px-3 py-6 lg:block xl:w-64">
        <div className="px-3 pb-5">
          <Badge tone="primary">{roleLabels[role]}</Badge>
        </div>
        {tree}
      </aside>
    </>
  )
}
