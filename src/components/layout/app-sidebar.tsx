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
  Receipt,
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
import { useMobileMenu } from '@/components/layout/mobile-menu'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const ICONS: Record<string, LucideIcon> = {
  home: Home,
  door: DoorOpen,
  search: Home,
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

export function AppSidebar({ role }: { role: RoleKey }) {
  const pathname = usePathname()
  const permissions = usePermissions()
  // Shared with the header, where the trigger lives.
  const { open, setOpen } = useMobileMenu()

  const canManageBilling = role === 'admin' || role === 'super_admin'

  React.useEffect(() => {
    setOpen(false)
  }, [pathname, setOpen])

  React.useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [open, setOpen])

  const visible = navigation
    .map((section) => {
      const items = section.items.filter((item) => {
        if (item.href === '/search') {
          return false
        }

        if (item.roles && !item.roles.includes(role)) {
          return false
        }

        if (item.permission && !can(permissions, item.permission)) {
          return false
        }

        return true
      })

      return {
        ...section,
        items,
      }
    })
    .filter((section) => section.items.length > 0)

  /**
   * Plan & Billing belongs under Account, not under a second heading also
   * called Account.
   *
   * It cannot live in navigation.ts with the others because it is gated on the
   * role rather than on a permission, so it is folded into the Account group
   * here. If that group is ever renamed or removed, the link becomes its own
   * section rather than disappearing.
   */
  const sections = canManageBilling
    ? (() => {
        const billing: NavItem = {
          label: 'Plan & Billing',
          labelBn: 'প্ল্যান ও বিলিং',
          href: '/settings/billing',
          icon: 'card',
        }

        const index = visible.findIndex((section) => section.heading === 'Account')

        if (index === -1) {
          return [...visible, { heading: 'Account', items: [billing] }]
        }

        return visible.map((section, position) =>
          position === index
            ? { ...section, items: [...section.items, billing] }
            : section,
        )
      })()
    : visible

  const isCurrent = (item: NavItem) => {
    return (
      pathname === item.href ||
      (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`))
    )
  }

  const handleLinkClick = () => {
    setOpen(false)
  }

  const tree = (
    <nav aria-label="Sections" className="space-y-6">
      {sections.map((section) => (
        <div key={section.heading}>
          <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            {section.heading}
          </p>

          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const Icon = ICONS[item.icon ?? ''] ?? Home
              const current = isCurrent(item)
              const disabled = Boolean(item.soon)

              return (
                <li key={item.href}>
                  <Link
                    href={disabled ? '#' : item.href}
                    aria-current={current ? 'page' : undefined}
                    aria-disabled={disabled || undefined}
                    onClick={disabled ? undefined : handleLinkClick}
                    className={cn(
                      'flex w-full items-center justify-start gap-3 rounded-control px-3 py-2 text-sm transition-colors',
                      current
                        ? 'bg-primary-soft font-medium text-primary'
                        : 'text-muted hover:bg-raised hover:text-ink',
                      disabled && 'pointer-events-none opacity-50',
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />

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
      {open && (
        <div className="fixed inset-0 z-[80] lg:hidden">
          <div
            className="absolute inset-0 animate-fade-in bg-ink/50 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          <div
            id="app-sidebar-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Sections"
            /*
              From the right, where the thumb already is on a phone — the same
              side as the button that opened it, so the drawer appears from
              under the finger rather than across the screen from it.
            */
            className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] animate-drawer-in flex-col border-l border-line bg-surface shadow-lift"
          >
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <Badge tone="primary">{roleLabels[role]}</Badge>

              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close the menu"
                className="inline-flex size-8 items-center justify-center rounded-control text-muted transition-colors hover:bg-raised hover:text-ink"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">{tree}</div>
          </div>
        </div>
      )}

      <aside className="sticky top-[4.5rem] hidden h-[calc(100dvh-4.5rem)] w-56 shrink-0 overflow-y-auto border-r border-line px-3 py-6 lg:block xl:w-64">
        <div className="px-3 pb-5">
          <Badge tone="primary">{roleLabels[role]}</Badge>
        </div>

        {tree}
      </aside>
    </>
  )
}