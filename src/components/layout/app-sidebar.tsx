'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import { navigation } from '@/lib/auth/navigation'
import { roleLabels, type RoleKey } from '@/lib/auth/permissions'
import { useCan, usePermissions } from '@/components/providers/permission-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * The sidebar is the same tree for everyone, filtered by permission. A
 * resident sees three links, an owner sees eleven, and neither menu is
 * maintained separately.
 */
export function AppSidebar({ role }: { role: RoleKey }) {
  const pathname = usePathname()
  const canDo = useCan()
  const { isSuperAdmin } = usePermissions()
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => setOpen(false), [pathname])

  const sections = navigation
    .map((section) => ({
      heading: section.heading,
      items: section.items.filter((item) => {
        if (item.roles && !item.roles.includes(role) && !isSuperAdmin) return false
        if (item.permission && !canDo(item.permission)) return false
        return true
      }),
    }))
    .filter((section) => section.items.length > 0)

  const isCurrent = (href: string) =>
    pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`))

  const tree = (
    <nav aria-label="Sections" className="space-y-6">
      {sections.map((section) => (
        <div key={section.heading}>
          <h2 className="px-3 text-xs font-semibold text-muted">{section.heading}</h2>
          <ul className="mt-2 space-y-0.5">
            {section.items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isCurrent(item.href) ? 'page' : undefined}
                  className={cn(
                    'flex items-center justify-between gap-2 rounded-control px-3 py-2 text-sm transition-colors',
                    isCurrent(item.href)
                      ? 'bg-primary-soft font-medium text-primary'
                      : 'text-muted hover:bg-raised hover:text-ink',
                  )}
                >
                  {item.label}
                  {item.soon && (
                    <span className="text-[0.65rem] font-medium text-muted">soon</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )

  return (
    <>
      <div className="border-b border-line px-5 py-3 lg:hidden">
        <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? <X /> : <Menu />}
          Menu
        </Button>
        {open && <div className="pt-4">{tree}</div>}
      </div>

      <aside className="hidden w-60 shrink-0 border-r border-line px-3 py-6 lg:block">
        <div className="px-3 pb-5">
          <Badge tone="primary">{roleLabels[role]}</Badge>
        </div>
        {tree}
      </aside>
    </>
  )
}
