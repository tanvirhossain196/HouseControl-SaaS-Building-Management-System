'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Activity,
  BellRing,
  Building2,
  ChartNoAxesColumn,
  ChevronLeft,
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
 * sixteen from the same source. Three states rather than two: expanded,
 * collapsed to icons on a wide screen, and a sheet on a narrow one. The
 * collapse is not persisted — a cookie for it would be one more thing to get
 * wrong, and the toggle is one click away.
 */
export function AppSidebar({ role }: { role: RoleKey }) {
  const pathname = usePathname()
  const permissions = usePermissions()
  const [open, setOpen] = React.useState(false)
  const [collapsed, setCollapsed] = React.useState(false)

  React.useEffect(() => {
    setOpen(false)
  }, [pathname])

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
          {!collapsed && (
            <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              {section.heading}
            </p>
          )}
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
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-control px-3 py-2 text-sm transition-colors',
                      collapsed && 'justify-center px-2',
                      current
                        ? 'bg-primary-soft font-medium text-primary'
                        : 'text-muted hover:bg-raised hover:text-ink',
                      item.soon && 'pointer-events-none opacity-50',
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    {!collapsed && (
                      <>
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.soon && (
                          <span className="text-[0.65rem] font-medium text-muted">
                            soon
                          </span>
                        )}
                      </>
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
      {/* Narrow screens: a button in the flow, and the tree below it. */}
      <div className="border-b border-line px-5 py-3 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="inline-flex items-center gap-2 rounded-control border border-line px-3 py-2 text-sm text-ink transition-colors hover:bg-raised"
        >
          {open ? <X className="size-4" /> : <Menu className="size-4" />}
          Menu
        </button>
        {open && <div className="pt-4">{tree}</div>}
      </div>

      <aside
        className={cn(
          'hidden shrink-0 border-r border-line py-6 transition-[width] duration-200 lg:block',
          collapsed ? 'w-16 px-2' : 'w-60 px-3',
        )}
      >
        <div className={cn('flex items-center gap-2 pb-5', collapsed ? 'px-1' : 'px-3')}>
          {!collapsed && <Badge tone="primary">{roleLabels[role]}</Badge>}
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'}
            className="ml-auto inline-flex size-7 items-center justify-center rounded-control text-muted transition-colors hover:bg-raised hover:text-ink"
          >
            <ChevronLeft
              className={cn('size-4 transition-transform', collapsed && 'rotate-180')}
              aria-hidden
            />
          </button>
        </div>

        {tree}
      </aside>
    </>
  )
}
