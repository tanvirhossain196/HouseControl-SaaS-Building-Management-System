'use client'

import * as React from 'react'
import {
  can,
  type Permission,
  type PermissionContext,
  type PermissionScope,
  type RoleKey,
} from '@/lib/auth/permissions'

type PermissionValue = PermissionContext & { role: RoleKey }

const Ctx = React.createContext<PermissionValue | null>(null)

/**
 * Carries the caller's memberships into client components so buttons they
 * cannot use are never rendered. This hides UI; it does not secure anything —
 * the server checks again on every action.
 */
export function PermissionProvider({
  value,
  children,
}: {
  value: PermissionValue
  children: React.ReactNode
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function usePermissions() {
  const ctx = React.useContext(Ctx)
  if (!ctx) throw new Error('usePermissions must be used inside <PermissionProvider>')
  return ctx
}

export function useCan() {
  const ctx = usePermissions()
  return React.useCallback(
    (permission: Permission, scope?: PermissionScope) => can(ctx, permission, scope),
    [ctx],
  )
}

/**
 * Renders children only when the permission is held.
 *
 *   <Can permission="payment.review" scope={{ flatId }}>
 *     <Button>Confirm payment</Button>
 *   </Can>
 *
 * Pass `fallback` when the person should see something explaining the absence
 * rather than a gap.
 */
export function Can({
  permission,
  scope,
  fallback = null,
  children,
}: {
  permission: Permission
  scope?: PermissionScope
  fallback?: React.ReactNode
  children: React.ReactNode
}) {
  const allowed = useCan()(permission, scope)
  return <>{allowed ? children : fallback}</>
}
