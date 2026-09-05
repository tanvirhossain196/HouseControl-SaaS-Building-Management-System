import type { Permission, RoleKey } from './permissions'

export type NavItem = {
  label: string
  /** Bangla label, shown when the interface is set to Bangla. */
  labelBn?: string
  href: string
  /** Lucide icon name, resolved in the sidebar. */
  icon?: string
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
      { label: 'Dashboard', labelBn: 'ড্যাশবোর্ড', href: '/dashboard', icon: 'home' },
      { label: 'My flats', labelBn: 'আমার ফ্ল্যাট', href: '/flats', icon: 'door' },
      {
        label: 'Search',
        labelBn: 'খুঁজুন',
        href: '/search',
        icon: 'search',
      },
      {
        label: 'Platform',
        labelBn: 'প্ল্যাটফর্ম',
        href: '/platform',
        roles: ['super_admin'],
        icon: 'shield',
      },
    ],
  },
  {
    heading: 'Building',
    items: [
      { label: 'Buildings', labelBn: 'বিল্ডিং', href: '/admin', permission: 'building.edit', icon: 'building' },
      { label: 'Flats', labelBn: 'ফ্ল্যাট', href: '/admin/flats', permission: 'flat.edit', icon: 'grid' },
      {
        label: 'Residents',
        labelBn: 'ভাড়াটিয়া',
        href: '/admin/residents',
        permission: 'resident.invite',
        icon: 'users',
      },
      {
        label: 'Invites',
        labelBn: 'আমন্ত্রণ',
        href: '/admin/team',
        permission: 'org.team.manage',
        icon: 'mail',
      },
    ],
  },
  {
    heading: 'Money',
    items: [
      { label: 'Dues', labelBn: 'বকেয়া', href: '/dues', permission: 'report.self.view', icon: 'receipt' },
      { label: 'Payments', labelBn: 'পেমেন্ট', href: '/payments', permission: 'payment.review', icon: 'wallet' },
      { label: 'Expenses', labelBn: 'খরচ', href: '/expenses', permission: 'expense.manage', soon: true, icon: 'coins' },
      { label: 'Reports', labelBn: 'রিপোর্ট', href: '/reports', permission: 'report.flat.view', icon: 'chart' },
    ],
  },
  {
    heading: 'Operations',
    items: [
      { label: 'Gate', labelBn: 'গেট', href: '/gate', permission: 'visitor.log', icon: 'door' },
      {
        label: 'Visitors',
        labelBn: 'ভিজিটর',
        href: '/visitors',
        permission: 'visitor.preapprove',
        icon: 'users',
      },
      {
        label: 'Repairs',
        labelBn: 'মেরামত',
        href: '/maintenance',
        permission: 'maintenance.create',
        icon: 'wrench',
      },
    ],
  },
  {
    heading: 'Account',
    items: [
      {
        label: 'Plan & billing',
        labelBn: 'প্ল্যান ও বিলিং',
        href: '/settings/billing',
        permission: 'org.billing.manage',
        icon: 'card',
      },
      { label: 'Your profile', labelBn: 'প্রোফাইল', href: '/settings/profile', icon: 'user' },
      {
        label: 'Notifications',
        labelBn: 'নোটিফিকেশন',
        href: '/settings/notifications',
        icon: 'bell',
      },
      {
        label: 'Audit log',
        labelBn: 'অডিট লগ',
        href: '/admin/audit',
        permission: 'org.audit.view',
        icon: 'activity',
      },
      { label: 'Support', labelBn: 'সাপোর্ট', href: '/contact', icon: 'help' },
    ],
  },
]
