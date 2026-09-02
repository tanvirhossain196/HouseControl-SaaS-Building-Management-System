import 'server-only'

import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import type { FlatRole, OrgRole, ProfileRow } from '@/types'

/**
 * Who the caller is, from the server's point of view.
 *
 * Every function here calls supabase.auth.getUser(), which verifies the token
 * with Supabase rather than trusting the cookie. Results are cached per
 * request, so several components asking the same question cost one round trip.
 */

export type SessionMemberships = {
  orgs: { orgId: string; role: OrgRole }[]
  flats: { flatId: string; role: FlatRole }[]
}

export type Session = {
  userId: string
  email: string
  profile: ProfileRow | null
  isPhoneVerified: boolean
  memberships: SessionMemberships
  isSuperAdmin: boolean
  isOrgAdmin: boolean
  isModerator: boolean
}

export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const [{ data: profile }, { data: orgRows }, { data: flatRows }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    supabase
      .from('org_members')
      .select('org_id, role')
      .eq('user_id', user.id)
      .eq('status', 'active'),
    supabase
      .from('flat_members')
      .select('flat_id, role')
      .eq('user_id', user.id)
      .eq('status', 'active'),
  ])

  const orgs = (orgRows ?? []).map((row) => ({ orgId: row.org_id, role: row.role }))
  const flats = (flatRows ?? []).map((row) => ({ flatId: row.flat_id, role: row.role }))

  return {
    userId: user.id,
    email: user.email ?? profile?.email ?? '',
    profile: profile ?? null,
    isPhoneVerified: Boolean(profile?.phone_verified_at),
    memberships: { orgs, flats },
    isSuperAdmin: profile?.platform_role === 'super_admin',
    isOrgAdmin: orgs.some((o) => o.role === 'admin'),
    isModerator: flats.some((f) => f.role === 'moderator'),
  }
})

/** For pages behind auth. Sends the person to sign-in and back again after. */
export async function requireSession(returnTo = '/dashboard'): Promise<Session> {
  const session = await getSession()
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(returnTo)}`)
  return session
}

/**
 * For actions that must be tied to a verified phone number — holding a
 * moderator role, and the Phase 8 handover in particular.
 */
export async function requireVerifiedPhone(returnTo = '/dashboard'): Promise<Session> {
  const session = await requireSession(returnTo)
  if (!session.isPhoneVerified) {
    redirect(`/onboarding/phone?next=${encodeURIComponent(returnTo)}`)
  }
  return session
}

/** The display name to greet someone with. */
export function displayName(session: Session): string {
  return session.profile?.full_name ?? session.email.split('@')[0] ?? 'there'
}
