import type { Permission, RoleKey } from './permissions'

export type NavItem = {
  label: string
  href: string
  /** Hidden unless the person holds this permission. */
  permission?: Permission
  /** Shown to these roles only. Omit for all. */
  roles?: RoleKey[]
  /** Marks a screen that arrives in a later phase. */
  soon?: boolean
}

export type NavSection = { heading: string; items: NavItem[] }

/**
 * One navigation tree, filtered per role. A resident and an owner see
 * different sidebars because the filter removes what they cannot use, not
 * because there are four hand-written menus to keep in sync.
 */
export const navigation: NavSection[] = [
  {
    heading: 'Overview',
    items: [
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'My flats', href: '/flats' },
      { label: 'Platform', href: '/platform', roles: ['super_admin'] },
    ],
  },
  {
    heading: 'Building',
    items: [
      { label: 'Buildings', href: '/admin', permission: 'building.edit' },
      { label: 'Flats', href: '/admin/flats', permission: 'flat.edit' },
      {
        label: 'Residents',
        href: '/admin/residents',
        permission: 'resident.invite',
      },
      { label: 'Invites', href: '/admin/team', permission: 'org.team.manage' },
    ],
  },
  {
    heading: 'Money',
    items: [
      { label: 'Dues', href: '/dues', permission: 'report.self.view' },
      { label: 'Payments', href: '/payments', permission: 'payment.review' },
      { label: 'Expenses', href: '/expenses', permission: 'expense.manage', soon: true },
      { label: 'Reports', href: '/reports', permission: 'report.flat.view' },
    ],
  },
  {
    heading: 'Operations',
    items: [
      { label: 'Gate', href: '/gate', permission: 'visitor.log' },
      {
        label: 'Visitors',
        href: '/visitors',
        permission: 'visitor.preapprove',
      },
      {
        label: 'Repairs',
        href: '/maintenance',
        permission: 'maintenance.create',
      },
    ],
  },
  {
    heading: 'Records',
    items: [{ label: 'Audit log', href: '/admin/audit', permission: 'org.audit.view' }],
  },
]
