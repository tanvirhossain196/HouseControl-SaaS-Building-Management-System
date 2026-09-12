import type { Permission, RoleKey } from './permissions'

export type NavItem = {
  label: string
  labelBn?: string
  href: string
  icon?: string
  permission?: Permission
  roles?: RoleKey[]
  soon?: boolean
}

export type NavSection = {
  heading: string
  items: NavItem[]
}

export const navigation: NavSection[] = [
  {
    heading: 'Overview',
    items: [
      {
        label: 'Dashboard',
        labelBn: 'ড্যাশবোর্ড',
        href: '/dashboard',
        icon: 'home',
      },
      {
        label: 'My Flat',
        labelBn: 'আমার ফ্ল্যাট',
        href: '/flats',
        icon: 'door',
        roles: ['resident', 'moderator'],
        permission: 'my_flat.view',
      },
      {
        label: 'Platform',
        labelBn: 'প্ল্যাটফর্ম',
        href: '/platform',
        icon: 'shield',
        roles: ['super_admin'],
      },
    ],
  },

  {
    heading: 'Building',
    items: [
      {
        label: 'Control',
        labelBn: 'নিয়ন্ত্রণ',
        href: '/control',
        icon: 'building',
        /**
         * Read-only, and both roles need it: the owner to see the whole
         * building, the moderator to see the flats they run. `payment.review`
         * is the permission both hold and nobody else does.
         */
        permission: 'payment.review',
      },
      {
        label: 'Buildings',
        labelBn: 'বিল্ডিং',
        href: '/admin',
        icon: 'building',
        permission: 'building.edit',
      },
      {
        label: 'Flats',
        labelBn: 'সব ফ্ল্যাট',
        href: '/admin/flats',
        icon: 'grid',
        permission: 'flat.edit',
      },
      {
        label: 'Residents',
        labelBn: 'ভাড়াটিয়া',
        href: '/admin/residents',
        icon: 'users',
        permission: 'resident.invite',
      },
      {
        label: 'Invites',
        labelBn: 'আমন্ত্রণ',
        href: '/admin/team',
        icon: 'mail',
        permission: 'org.team.manage',
      },
    ],
  },

  {
    heading: 'Money',
    items: [
      {
        label: 'Dues',
        labelBn: 'বকেয়া',
        href: '/dues',
        icon: 'receipt',
        permission: 'report.self.view',
      },
      {
        label: 'Payments',
        labelBn: 'পেমেন্ট',
        href: '/payments',
        icon: 'wallet',
        permission: 'report.self.view',
      },
      {
        label: 'Expenses',
        labelBn: 'খরচ',
        href: '/expenses',
        icon: 'coins',
        permission: 'expense.manage',
        soon: true,
      },
      {
        label: 'Handovers',
        labelBn: 'হস্তান্তর',
        href: '/remittances',
        icon: 'wallet',
        /**
         * No permission gate. A resident owes their moderator, a moderator owes
         * the owner, and an owner reviews both — every role has something on
         * this page, and each of them only ever sees their own half.
         */
      },
      {
        label: 'Reports',
        labelBn: 'রিপোর্ট',
        href: '/reports',
        icon: 'chart',
        permission: 'report.flat.view',
      },
    ],
  },

  {
    heading: 'Operations',
    items: [
      {
        label: 'Gate',
        labelBn: 'গেট',
        href: '/gate',
        icon: 'door',
        permission: 'visitor.log',
      },
      {
        label: 'Visitors',
        labelBn: 'ভিজিটর',
        href: '/visitors',
        icon: 'users',
        permission: 'visitor.preapprove',
      },
      {
        label: 'Maintenance',
        labelBn: 'মেইনটেন্যান্স',
        href: '/maintenance',
        icon: 'wrench',
        permission: 'maintenance.create',
      },
    ],
  },

  {
    heading: 'Account',
    items: [
      {
        label: 'Profile',
        labelBn: 'প্রোফাইল',
        href: '/settings/profile',
        icon: 'user',
      },
      {
        label: 'Notifications',
        labelBn: 'নোটিফিকেশন',
        /**
         * The history, not the preferences.
         *
         * Somebody clicking a bell-shaped menu entry wants to know what they
         * were told, not to configure what they will be told. The settings
         * page is linked from the bottom of this one.
         */
        href: '/notifications',
        icon: 'bell',
      },
      {
        label: 'Pricing',
        labelBn: 'মূল্য',
        href: '/settings/plans',
        icon: 'card',
        // Buying a plan is the owner's decision, so the prices are theirs too.
        roles: ['admin', 'super_admin'],
      },
      {
        label: 'Support',
        labelBn: 'সাপোর্ট',
        href: '/contact',
        icon: 'help',
      },
    ],
  },
]
