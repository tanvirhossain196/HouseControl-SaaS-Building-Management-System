import 'server-only'

import { redirect } from 'next/navigation'
import { forbidden } from '@/lib/errors'
import { getSession, requireSession, type Session } from './session'
import {
  can,
  grantedPermissions,
  primaryRole,
  type Permission,
  type PermissionContext,
  type PermissionScope,
  type RoleKey,
} from './permissions'

/** The shape `can()` needs, pulled out of a session. */
export function permissionContext(session: Session): PermissionContext {
  return {
    isSuperAdmin: session.isSuperAdmin,
    orgs: session.memberships.orgs,
    flats: session.memberships.flats,
  }
}

export function sessionCan(
  session: Session,
  permission: Permission,
  scope?: PermissionScope,
): boolean {
  return can(permissionContext(session), permission, scope)
}

export function sessionRole(session: Session): RoleKey {
  return primaryRole(permissionContext(session))
}

export function sessionPermissions(session: Session): Permission[] {
  return grantedPermissions(permissionContext(session))
}

/**
 * For pages. Sends someone who lacks the permission to /forbidden rather than
 * 404 — pretending the page does not exist confuses people who simply hold
 * the wrong role.
 */
export async function requirePermission(
  permission: Permission,
  scope?: PermissionScope,
): Promise<Session> {
  const session = await requireSession()
  if (!sessionCan(session, permission, scope)) {
    redirect(`/forbidden?permission=${encodeURIComponent(permission)}`)
  }
  return session
}

/** For server actions and API handlers: throws a 403 instead of redirecting. */
export async function assertPermission(
  permission: Permission,
  scope?: PermissionScope,
): Promise<Session> {
  const session = await getSession()
  if (!session) throw forbidden('Sign in to continue.')
  if (!sessionCan(session, permission, scope)) {
    throw forbidden('Your role does not allow this.')
  }
  return session
}

/** The organization a lone admin manages — most owners only have one. */
export function defaultOrgId(session: Session): string | null {
  return session.memberships.orgs.find((o) => o.role === 'admin')?.orgId ?? null
}
