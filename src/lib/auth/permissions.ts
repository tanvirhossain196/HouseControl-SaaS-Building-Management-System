/**
 * Who may do what.
 *
 * One list of permissions, one map from role to permission, one `can()` used
 * by the UI, the server actions and the API alike. When a rule changes it
 * changes here, not in fifteen components.
 *
 * This is the convenience layer. The enforcing layer is the RLS policies in
 * supabase/migrations/0007_rls.sql — if these two ever disagree, the database
 * wins and the user sees an error rather than someone else's data.
 */

export const PERMISSIONS = [
  // Platform
  'platform.manage',
  'platform.audit.view',

  // Organization
  'org.manage',
  'org.billing.manage',
  'org.team.manage',
  'org.audit.view',

  // Property
  'building.create',
  'building.edit',
  'building.archive',
  'flat.create',
  'flat.edit',
  'flat.archive',
  'flat.assign_moderator',
  'landlord_rent.manage',

  // People
  'resident.invite',
  'resident.remove',
  'rent.assign',
  'moderator.transfer',

  // Money
  'payment.submit',
  'payment.review',
  'due.manage',
  'expense.manage',

  // Gate
  'visitor.log',
  'visitor.preapprove',
  'visitor.block',

  // Repairs
  'maintenance.create',
  'maintenance.assign',
  'maintenance.resolve',

  // Reading
  'report.org.view',
  'report.flat.view',
  'report.self.view',
] as const

export type Permission = (typeof PERMISSIONS)[number]

/** The four roles from the product, plus the gate sub-role. */
export type RoleKey = 'super_admin' | 'admin' | 'moderator' | 'resident' | 'guard'

const RESIDENT: Permission[] = [
  'payment.submit',
  'maintenance.create',
  'visitor.preapprove',
  'report.self.view',
]

const GUARD: Permission[] = ['visitor.log', 'maintenance.create']

const MODERATOR: Permission[] = [
  ...RESIDENT,
  'resident.invite',
  'resident.remove',
  'rent.assign',
  'moderator.transfer',
  'payment.review',
  'due.manage',
  'expense.manage',
  'visitor.log',
  'visitor.preapprove',
  'maintenance.assign',
  'maintenance.resolve',
  'report.flat.view',
]

const ADMIN: Permission[] = [
  ...MODERATOR,
  'org.manage',
  'org.billing.manage',
  'org.team.manage',
  'org.audit.view',
  'building.create',
  'building.edit',
  'building.archive',
  'flat.create',
  'flat.edit',
  'flat.archive',
  'flat.assign_moderator',
  'landlord_rent.manage',
  'visitor.block',
  'report.org.view',
]

export const rolePermissions: Record<RoleKey, readonly Permission[]> = {
  super_admin: [...PERMISSIONS],
  admin: ADMIN,
  moderator: MODERATOR,
  resident: RESIDENT,
  guard: GUARD,
}

/** Where a permission applies. Omit both to ask "anywhere at all?". */
export type PermissionScope = {
  orgId?: string
  flatId?: string
}

/** The subset of a session `can()` needs — kept small so client code can hold it. */
export type PermissionContext = {
  isSuperAdmin: boolean
  orgs: { orgId: string; role: 'admin' | 'guard' }[]
  flats: { flatId: string; role: 'moderator' | 'resident' }[]
}

function roleGrants(role: RoleKey, permission: Permission) {
  return rolePermissions[role].includes(permission)
}

/**
 * True when the person may perform `permission` in `scope`.
 *
 * An org admin inherits moderator rights over flats in their own organization,
 * but only when the caller passes `orgId` — without it there is no way to know
 * the flat belongs to them, and guessing in the permissive direction is how
 * access bugs happen.
 */
export function can(
  context: PermissionContext,
  permission: Permission,
  scope: PermissionScope = {},
): boolean {
  if (context.isSuperAdmin) return true

  const orgRoles = scope.orgId
    ? context.orgs.filter((o) => o.orgId === scope.orgId)
    : context.orgs
  const flatRoles = scope.flatId
    ? context.flats.filter((f) => f.flatId === scope.flatId)
    : context.flats

  for (const org of orgRoles) {
    const role: RoleKey = org.role === 'admin' ? 'admin' : 'guard'
    if (roleGrants(role, permission)) {
      // An admin's flat-level rights only extend to flats in that org, so a
      // flat-scoped question needs the org named too.
      if (scope.flatId && !scope.orgId) continue
      return true
    }
  }

  for (const flat of flatRoles) {
    if (roleGrants(flat.role, permission)) return true
  }

  return false
}

/** Every permission the person holds somewhere. Used to hide dead UI. */
export function grantedPermissions(context: PermissionContext): Permission[] {
  if (context.isSuperAdmin) return [...PERMISSIONS]

  const granted = new Set<Permission>()
  for (const org of context.orgs) {
    const role: RoleKey = org.role === 'admin' ? 'admin' : 'guard'
    rolePermissions[role].forEach((p) => granted.add(p))
  }
  for (const flat of context.flats) {
    rolePermissions[flat.role].forEach((p) => granted.add(p))
  }
  return [...granted]
}

/** The highest role the person holds — decides which dashboard they land on. */
export function primaryRole(context: PermissionContext): RoleKey {
  if (context.isSuperAdmin) return 'super_admin'
  if (context.orgs.some((o) => o.role === 'admin')) return 'admin'
  if (context.flats.some((f) => f.role === 'moderator')) return 'moderator'
  if (context.orgs.some((o) => o.role === 'guard')) return 'guard'
  return 'resident'
}

export const roleLabels: Record<RoleKey, string> = {
  super_admin: 'Platform admin',
  admin: 'Building owner',
  moderator: 'Flat moderator',
  resident: 'Resident',
  guard: 'Gate',
}

/** Where each role starts after signing in. */
export const roleHome: Record<RoleKey, string> = {
  super_admin: '/platform',
  admin: '/admin',
  moderator: '/dashboard',
  resident: '/dashboard',
  guard: '/gate',
}
