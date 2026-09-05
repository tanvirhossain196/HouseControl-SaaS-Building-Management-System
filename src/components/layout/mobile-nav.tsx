'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Building2,
  DoorOpen,
  Home,
  Receipt,
  Tag,
  User,
  Wallet,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { can } from '@/lib/auth/permissions'
import { usePermissions } from '@/components/providers/permission-provider'
import { cn } from '@/lib/utils'

/**
 * The bar along the bottom of a phone.
 *
 * A thumb reaches the bottom of a screen and not the top, so the four things
 * a person opens all day live down here and the drawer keeps everything else.
 * Four, not six: past four the targets stop being comfortably tappable on a
 * narrow phone, and a bar nobody can hit accurately is worse than a menu.
 *
 * Which four depends on the role, because a guard and an owner do not open
 * the same screens. Everyone gets Home and Profile; the middle two are
 * whatever that person actually uses.
 */
type Item = { label: string; href: string; icon: LucideIcon }

export function MobileNav() {
  const pathname = usePathname()
  const permissions = usePermissions()

  const middle: Item[] = []

  if (can(permissions, 'visitor.log')) {
    middle.push({ label: 'Gate', href: '/gate', icon: DoorOpen })
  }

  if (can(permissions, 'building.edit')) {
    middle.push({ label: 'Buildings', href: '/admin', icon: Building2 })
  }

  if (can(permissions, 'payment.review')) {
    middle.push({ label: 'Payments', href: '/payments', icon: Wallet })
  } else if (can(permissions, 'report.self.view')) {
    middle.push({ label: 'Dues', href: '/dues', icon: Receipt })
  }

  if (middle.length < 2 && can(permissions, 'maintenance.create')) {
    middle.push({ label: 'Repairs', href: '/maintenance', icon: Wrench })
  }

  if (middle.length < 2) {
    middle.push({ label: 'Pricing', href: '/pricing', icon: Tag })
  }

  const items: Item[] = [
    { label: 'Home', href: '/dashboard', icon: Home },
    ...middle.slice(0, 2),
    { label: 'Profile', href: '/settings/profile', icon: User },
  ]

  const isCurrent = (href: string) =>
    pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`))

  return (
    <nav
      aria-label="Main"
      // `pb-[env(safe-area-inset-bottom)]` keeps the row clear of the home
      // indicator on an iPhone, where the last 34 pixels are not tappable.
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      <ul className="mx-auto flex max-w-lg items-stretch">
        {items.map((item) => {
          const current = isCurrent(item.href)
          const Icon = item.icon

          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  // 56px tall: the smallest target that is reliably hit with
                  // a thumb while walking, which is how a guard uses this.
                  'flex h-14 flex-col items-center justify-center gap-1 text-[0.65rem] font-medium transition-colors',
                  current ? 'text-primary' : 'text-muted hover:text-ink',
                )}
              >
                <Icon className="size-5" aria-hidden />
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
