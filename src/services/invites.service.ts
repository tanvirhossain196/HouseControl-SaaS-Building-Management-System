import 'server-only'

import { createHash, randomBytes } from 'node:crypto'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { publicEnv } from '@/lib/env'
import { AppError, conflict, forbidden, notFound, toAppError } from '@/lib/errors'
import { writeAuditLog } from './audit.service'
import type { AppRole, InviteRow } from '@/types'

/**
 * Invitations are the only way a person joins a building.
 *
 * The token is random and 32 bytes; only its SHA-256 hash is stored. A leaked
 * database dump therefore contains no usable invite links, and the token in
 * the email cannot be reconstructed from what we hold.
 */

const INVITE_TTL_DAYS = 7

export type InviteInput = {
  orgId: string
  email: string
  role: Extract<AppRole, 'admin' | 'moderator' | 'member' | 'guard'>
  flatId?: string
  rentShare?: number
}

export type InviteSummary = {
  id: string
  email: string
  role: AppRole
  flatId: string | null
  flatLabel: string | null
  expiresAt: string
  acceptedAt: string | null
  revokedAt: string | null
  status: 'pending' | 'accepted' | 'revoked' | 'expired'
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function inviteStatus(row: {
  accepted_at: string | null
  revoked_at: string | null
  expires_at: string
}): InviteSummary['status'] {
  if (row.accepted_at) return 'accepted'
  if (row.revoked_at) return 'revoked'
  if (new Date(row.expires_at) < new Date()) return 'expired'
  return 'pending'
}

/**
 * Creates the invite and returns the one-time link. Phase 11 emails it; until
 * then the caller shows it so an owner can send it by WhatsApp.
 */
export async function createInvite(
  actorId: string,
  input: InviteInput,
): Promise<{ invite: InviteSummary; link: string }> {
  const supabase = createServerSupabase()

  if ((input.role === 'moderator' || input.role === 'member') && !input.flatId) {
    throw new AppError('bad_request', 'Pick the flat this person belongs to.')
  }

  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000).toISOString()

  const { data, error } = await supabase
    .from('invites')
    .insert({
      org_id: input.orgId,
      flat_id: input.flatId ?? null,
      email: input.email,
      role: input.role,
      rent_share: input.rentShare ?? null,
      token_hash: hashToken(token),
      invited_by: actorId,
      expires_at: expiresAt,
    })
    .select('id, email, role, flat_id, expires_at, accepted_at, revoked_at')
    .single()

  if (error) {
    // The partial unique index in 0002 allows one live invite per target.
    if (error.code === '23505') {
      throw conflict('That person already has an invite waiting for this flat.')
    }
    throw toAppError(error)
  }

  await writeAuditLog({
    orgId: input.orgId,
    actorId,
    action: 'invite.created',
    entityType: 'invite',
    entityId: data.id,
    after: { email: input.email, role: input.role, flatId: input.flatId ?? null },
  })

  return {
    invite: {
      id: data.id,
      email: data.email,
      role: data.role,
      flatId: data.flat_id,
      flatLabel: null,
      expiresAt: data.expires_at,
      acceptedAt: data.accepted_at,
      revokedAt: data.revoked_at,
      status: inviteStatus(data),
    },
    link: new URL(`/invites/${token}`, publicEnv().NEXT_PUBLIC_SITE_URL).toString(),
  }
}

export async function listInvites(orgId: string): Promise<InviteSummary[]> {
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('invites')
    .select(
      'id, email, role, flat_id, expires_at, accepted_at, revoked_at, flats(unit_number)',
    )
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) throw toAppError(error)

  // Embedded selects are not expressible in the hand-written Database type.
  // Regenerating with `npm run db:types` removes the need for this cast.
  const rows = (data ?? []) as unknown as (InviteRow & {
    flats: { unit_number: string } | null
  })[]

  return rows.map((row) => {
    const flat = row.flats
    return {
      id: row.id,
      email: row.email,
      role: row.role,
      flatId: row.flat_id,
      flatLabel: flat?.unit_number ?? null,
      expiresAt: row.expires_at,
      acceptedAt: row.accepted_at,
      revokedAt: row.revoked_at,
      status: inviteStatus(row),
    }
  })
}

export async function revokeInvite(actorId: string, inviteId: string): Promise<void> {
  const supabase = createServerSupabase()

  const { data, error } = await supabase
    .from('invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', inviteId)
    .is('accepted_at', null)
    .select('id, org_id, email')
    .maybeSingle()

  if (error) throw toAppError(error)
  if (!data) throw notFound('That invite')

  await writeAuditLog({
    orgId: data.org_id,
    actorId,
    action: 'invite.revoked',
    entityType: 'invite',
    entityId: data.id,
    before: { email: data.email },
  })
}

/** What the accept page shows before anyone commits to anything. */
export type InvitePreview = {
  id: string
  email: string
  role: AppRole
  orgName: string
  flatLabel: string | null
  rentShare: number | null
  expiresAt: string
}

/**
 * Reads an invite by its raw token.
 *
 * Uses the service role deliberately: the recipient may not have an account
 * yet, and even signed in, RLS would not let them read a row addressed to an
 * email they have not proved is theirs. Nothing is written here.
 */
export async function previewInvite(token: string): Promise<InvitePreview> {
  const admin = createAdminSupabase()

  const { data: raw, error } = await admin
    .from('invites')
    .select(
      'id, email, role, rent_share, expires_at, accepted_at, revoked_at, organizations(name), flats(unit_number)',
    )
    .eq('token_hash', hashToken(token))
    .maybeSingle()

  if (error) throw toAppError(error)
  if (!raw) throw notFound('That invite')

  const data = raw as unknown as InviteRow & {
    organizations: { name: string } | null
    flats: { unit_number: string } | null
  }
  if (data.revoked_at) throw new AppError('conflict', 'This invite was withdrawn.')
  if (data.accepted_at)
    throw new AppError('conflict', 'This invite has already been used.')
  if (new Date(data.expires_at) < new Date()) {
    throw new AppError('conflict', 'This invite has expired. Ask for a new one.')
  }

  const org = data.organizations
  const flat = data.flats

  return {
    id: data.id,
    email: data.email,
    role: data.role,
    orgName: org?.name ?? 'a building',
    flatLabel: flat?.unit_number ?? null,
    rentShare: data.rent_share,
    expiresAt: data.expires_at,
  }
}

/**
 * Accepts an invite for the signed-in user.
 *
 * The account's email must match the address the invite was sent to —
 * otherwise anyone holding the link could join as themselves.
 */
export async function acceptInvite(
  userId: string,
  userEmail: string,
  token: string,
): Promise<{ role: AppRole }> {
  const admin = createAdminSupabase()
  const tokenHash = hashToken(token)

  const { data: invite, error } = await admin
    .from('invites')
    .select(
      'id, org_id, flat_id, email, role, rent_share, expires_at, accepted_at, revoked_at',
    )
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (error) throw toAppError(error)
  if (!invite) throw notFound('That invite')
  if (invite.accepted_at) throw conflict('This invite has already been used.')
  if (invite.revoked_at) throw conflict('This invite was withdrawn.')
  if (new Date(invite.expires_at) < new Date()) {
    throw conflict('This invite has expired. Ask for a new one.')
  }

  if (invite.email.toLowerCase() !== userEmail.toLowerCase()) {
    throw forbidden(
      `This invite was sent to ${invite.email}. Sign in with that address to accept it.`,
    )
  }

  if (invite.role === 'admin' || invite.role === 'guard') {
    const { error: membershipError } = await admin
      .from('org_members')
      .upsert(
        { org_id: invite.org_id, user_id: userId, role: invite.role, status: 'active' },
        { onConflict: 'org_id,user_id' },
      )
    if (membershipError) throw toAppError(membershipError)
  } else {
    if (!invite.flat_id)
      throw new AppError('bad_request', 'This invite has no flat attached.')

    const { error: membershipError } = await admin.from('flat_members').insert({
      flat_id: invite.flat_id,
      user_id: userId,
      role: invite.role === 'moderator' ? 'moderator' : 'resident',
      rent_share: invite.rent_share ?? 0,
      status: 'active',
    })

    // The single-moderator index and the rent-share trigger both surface here.
    if (membershipError) throw toAppError(membershipError)
  }

  const { error: closeError } = await admin
    .from('invites')
    .update({ accepted_at: new Date().toISOString(), accepted_by: userId })
    .eq('id', invite.id)
    .is('accepted_at', null)

  if (closeError) throw toAppError(closeError)

  await writeAuditLog({
    orgId: invite.org_id,
    actorId: userId,
    action: 'invite.accepted',
    entityType: 'invite',
    entityId: invite.id,
    after: { role: invite.role, flatId: invite.flat_id },
  })

  return { role: invite.role }
}
