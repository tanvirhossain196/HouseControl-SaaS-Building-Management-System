import 'server-only'

import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { AppError, conflict, forbidden, notFound, toAppError } from '@/lib/errors'
import { writeAuditLog } from './audit.service'
import { generateEntryCode } from '@/lib/gate-codes'
import {
  codeExpired,
  codeExpiryFrom,
  formatEntryCode,
  needsFlat,
  normaliseEntryCode,
  normalisePhone,
  type VisitorKind,
} from '@/lib/gate'
import type { VisitorRow } from '@/types'

/**
 * The gate register.
 *
 * Two people use this and they need different things. The guard is standing at
 * a gate with somebody waiting: their actions are one tap each and never
 * block on a lookup that might be slow. The resident wants to know who came,
 * and to say in advance who is allowed.
 *
 * A block is checked before every entry, because a list nobody consults is
 * just a list.
 */

export type VisitorWithContext = VisitorRow & {
  kind: VisitorKind
  code_expires_at: string | null
  notified_at: string | null
  vehicle: string | null
  id_note: string | null
  unitNumber: string | null
  approvedByName: string | null
}

const WITH_CONTEXT =
  '*, flats(unit_number), profiles!visitors_pre_approved_by_fkey(full_name)'

function decorate(rows: unknown[]): VisitorWithContext[] {
  const visitors = rows as (VisitorWithContext & {
    flats: { unit_number: string } | null
    profiles: { full_name: string } | null
  })[]

  return visitors.map((visitor) => ({
    ...visitor,
    unitNumber: visitor.flats?.unit_number ?? null,
    approvedByName: visitor.profiles?.full_name ?? null,
  }))
}

/** Everyone logged in and not yet marked out. */
export async function listInside(buildingId: string): Promise<VisitorWithContext[]> {
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('visitors')
    .select(WITH_CONTEXT)
    .eq('building_id', buildingId)
    .eq('state', 'inside')
    .order('entered_at', { ascending: false })

  if (error) throw toAppError(error)
  return decorate(data ?? [])
}

/** Guests expected today, with their codes still live. */
export async function listExpected(buildingId: string): Promise<VisitorWithContext[]> {
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('visitors')
    .select(WITH_CONTEXT)
    .eq('building_id', buildingId)
    .eq('state', 'pre_approved')
    .order('expected_at', { ascending: true })

  if (error) throw toAppError(error)
  return decorate(data ?? [])
}

export async function listRecentVisits(
  buildingId: string,
  limit = 100,
): Promise<VisitorWithContext[]> {
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('visitors')
    .select(WITH_CONTEXT)
    .eq('building_id', buildingId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw toAppError(error)
  return decorate(data ?? [])
}

export async function listVisitsForFlats(
  flatIds: string[],
  limit = 50,
): Promise<VisitorWithContext[]> {
  if (flatIds.length === 0) return []

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('visitors')
    .select(WITH_CONTEXT)
    .in('flat_id', flatIds)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw toAppError(error)
  return decorate(data ?? [])
}

export type BlockedVisitor = {
  id: string
  building_id: string
  full_name: string
  phone: string | null
  reason: string
  created_at: string
}

export async function listBlocked(buildingId: string): Promise<BlockedVisitor[]> {
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('blocked_visitors')
    .select('id, building_id, full_name, phone, reason, created_at')
    .eq('building_id', buildingId)
    .is('lifted_at', null)
    .order('created_at', { ascending: false })

  if (error) throw toAppError(error)
  return (data ?? []) as BlockedVisitor[]
}

/** Is this number on the building's list? Checked before every entry. */
export async function findBlock(
  buildingId: string,
  phone: string | null,
): Promise<BlockedVisitor | null> {
  const normalised = normalisePhone(phone)
  if (!normalised) return null

  const blocked = await listBlocked(buildingId)
  return blocked.find((entry) => normalisePhone(entry.phone) === normalised) ?? null
}

export type LogEntryInput = {
  buildingId: string
  flatId?: string
  fullName: string
  phone?: string
  kind: VisitorKind
  purpose?: string
  vehicle?: string
  idNote?: string
  photoUrl?: string
  /** Set when the guard matched a pre-approval code. */
  visitorId?: string
}

/**
 * Logs someone in.
 *
 * Blocked numbers are refused here rather than warned about, because a guard
 * with a person in front of them will click through a warning. Overriding is
 * a moderator's decision — they can lift the block.
 */
export async function logEntry(
  guardId: string,
  input: LogEntryInput,
): Promise<VisitorWithContext> {
  const supabase = createServerSupabase()

  if (needsFlat(input.kind) && !input.flatId) {
    throw new AppError('bad_request', 'Say which flat they are visiting.')
  }

  const block = await findBlock(input.buildingId, input.phone ?? null)
  if (block) {
    throw forbidden(
      `${block.full_name} is on this building's blocked list: ${block.reason}. A moderator has to lift it before they can be logged in.`,
    )
  }

  const now = new Date().toISOString()

  // Arriving on a pre-approval code updates the existing row rather than
  // creating a second one, so the resident's approval and the actual arrival
  // stay on one record.
  if (input.visitorId) {
    const { data, error } = await supabase
      .from('visitors')
      .update({
        state: 'inside',
        entered_at: now,
        logged_by: guardId,
        entry_code: null,
        ...(input.vehicle && { vehicle: input.vehicle }),
        ...(input.idNote && { id_note: input.idNote }),
      })
      .eq('id', input.visitorId)
      .eq('state', 'pre_approved')
      .select(WITH_CONTEXT)
      .maybeSingle()

    if (error) throw toAppError(error)
    if (!data) throw conflict('That code has already been used.')

    const visitor = decorate([data])[0]!
    await notifyResidents(visitor, 'arrived')
    await writeAuditLog({
      actorId: guardId,
      action: 'visitor.entered_with_code',
      entityType: 'visitor',
      entityId: visitor.id,
      after: { name: visitor.full_name, flat: visitor.flat_id },
    })
    return visitor
  }

  const { data, error } = await supabase
    .from('visitors')
    .insert({
      building_id: input.buildingId,
      flat_id: input.flatId ?? null,
      full_name: input.fullName,
      phone: normalisePhone(input.phone) ?? null,
      kind: input.kind,
      purpose: input.purpose ?? null,
      vehicle: input.vehicle ?? null,
      id_note: input.idNote ?? null,
      photo_url: input.photoUrl ?? null,
      state: 'inside',
      entered_at: now,
      logged_by: guardId,
    })
    .select(WITH_CONTEXT)
    .single()

  if (error) throw toAppError(error)

  const visitor = decorate([data])[0]!
  await notifyResidents(visitor, 'arrived')

  await writeAuditLog({
    actorId: guardId,
    action: 'visitor.entered',
    entityType: 'visitor',
    entityId: visitor.id,
    after: { name: visitor.full_name, kind: visitor.kind, flat: visitor.flat_id },
  })

  return visitor
}

/** One tap, and the gate list gets shorter. */
export async function markExit(guardId: string, visitorId: string): Promise<void> {
  const supabase = createServerSupabase()

  const { data, error } = await supabase
    .from('visitors')
    .update({
      state: 'exited',
      exited_at: new Date().toISOString(),
      exit_logged_by: guardId,
    })
    .eq('id', visitorId)
    .eq('state', 'inside')
    .select('id, full_name')
    .maybeSingle()

  if (error) throw toAppError(error)
  if (!data) throw conflict('They have already been marked out.')

  await writeAuditLog({
    actorId: guardId,
    action: 'visitor.exited',
    entityType: 'visitor',
    entityId: visitorId,
    after: { name: data.full_name },
  })
}

/** The guard turns someone away. Recorded, because being turned away matters. */
export async function denyEntry(
  guardId: string,
  input: {
    buildingId: string
    flatId?: string
    fullName: string
    phone?: string
    reason: string
  },
): Promise<void> {
  const supabase = createServerSupabase()

  const { data, error } = await supabase
    .from('visitors')
    .insert({
      building_id: input.buildingId,
      flat_id: input.flatId ?? null,
      full_name: input.fullName,
      phone: normalisePhone(input.phone) ?? null,
      state: 'denied',
      purpose: input.reason,
      logged_by: guardId,
    })
    .select('id')
    .single()

  if (error) throw toAppError(error)

  await writeAuditLog({
    actorId: guardId,
    action: 'visitor.denied',
    entityType: 'visitor',
    entityId: data.id,
    after: { name: input.fullName, reason: input.reason },
  })
}

export type PreApprovalInput = {
  flatId: string
  buildingId: string
  fullName: string
  phone?: string
  kind: VisitorKind
  purpose?: string
  expectedAt?: string
}

export type PreApproval = { visitorId: string; code: string; expiresAt: string }

/**
 * A resident says who is coming. The code is what the guard checks.
 *
 * Codes are unique among live pre-approvals in a building, so the guard's
 * lookup can be an exact match rather than a list to scroll.
 */
export async function preApprove(
  residentId: string,
  input: PreApprovalInput,
): Promise<PreApproval> {
  const supabase = createServerSupabase()
  const expiresAt = codeExpiryFrom()

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateEntryCode()

    const { data, error } = await supabase
      .from('visitors')
      .insert({
        building_id: input.buildingId,
        flat_id: input.flatId,
        full_name: input.fullName,
        phone: normalisePhone(input.phone) ?? null,
        kind: input.kind,
        purpose: input.purpose ?? null,
        state: 'pre_approved',
        entry_code: code,
        code_expires_at: expiresAt,
        expected_at: input.expectedAt ?? null,
        pre_approved_by: residentId,
      })
      .select('id')
      .single()

    if (!error && data) {
      await writeAuditLog({
        actorId: residentId,
        action: 'visitor.pre_approved',
        entityType: 'visitor',
        entityId: data.id,
        after: { name: input.fullName, flat: input.flatId },
      })

      return { visitorId: data.id, code: formatEntryCode(code), expiresAt }
    }

    // A collision on the live-code index means try another code.
    if ((error as { code?: string } | null)?.code !== '23505') throw toAppError(error)
  }

  throw new AppError('internal_error', 'Could not issue an entry code. Try again.')
}

/** The guard types a code. Exact match, or nothing. */
export async function findByCode(
  buildingId: string,
  input: string,
): Promise<VisitorWithContext | null> {
  const code = normaliseEntryCode(input)
  if (code.length !== 6) return null

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('visitors')
    .select(WITH_CONTEXT)
    .eq('building_id', buildingId)
    .eq('entry_code', code)
    .eq('state', 'pre_approved')
    .maybeSingle()

  if (error) throw toAppError(error)
  if (!data) return null

  const visitor = decorate([data])[0]!

  if (codeExpired(visitor.code_expires_at)) {
    throw conflict('That code has expired. Ask the resident to approve them again.')
  }

  return visitor
}

/** A resident calling off an approval before the guest arrives. */
export async function cancelPreApproval(
  userId: string,
  visitorId: string,
): Promise<void> {
  const supabase = createServerSupabase()

  const { data, error } = await supabase
    .from('visitors')
    .update({ state: 'denied', entry_code: null })
    .eq('id', visitorId)
    .eq('state', 'pre_approved')
    .select('id, full_name')
    .maybeSingle()

  if (error) throw toAppError(error)
  if (!data) throw notFound('That approval')

  await writeAuditLog({
    actorId: userId,
    action: 'visitor.approval_cancelled',
    entityType: 'visitor',
    entityId: visitorId,
    after: { name: data.full_name },
  })
}

export async function blockVisitor(
  actorId: string,
  input: { buildingId: string; fullName: string; phone?: string; reason: string },
): Promise<void> {
  const supabase = createServerSupabase()
  const phone = normalisePhone(input.phone)

  const { error } = await supabase.from('blocked_visitors').insert({
    building_id: input.buildingId,
    full_name: input.fullName,
    phone,
    reason: input.reason,
    blocked_by: actorId,
  })

  if (error) throw toAppError(error)

  await writeAuditLog({
    actorId,
    action: 'visitor.blocked',
    entityType: 'building',
    entityId: input.buildingId,
    after: { name: input.fullName, phone, reason: input.reason },
  })
}

export async function liftBlock(actorId: string, blockId: string): Promise<void> {
  const supabase = createServerSupabase()

  const { data, error } = await supabase
    .from('blocked_visitors')
    .update({ lifted_at: new Date().toISOString(), lifted_by: actorId })
    .eq('id', blockId)
    .is('lifted_at', null)
    .select('id, full_name, building_id')
    .maybeSingle()

  if (error) throw toAppError(error)
  if (!data) throw notFound('That block')

  await writeAuditLog({
    actorId,
    action: 'visitor.block_lifted',
    entityType: 'building',
    entityId: data.building_id,
    after: { name: data.full_name },
  })
}

/**
 * Tells the flat someone has arrived.
 *
 * Uses the service role: the guard cannot read the flat's resident list, and
 * should not be able to. They log an arrival; the notification is the
 * system's job, not theirs.
 */
async function notifyResidents(visitor: VisitorWithContext, what: 'arrived') {
  if (!visitor.flat_id) return

  try {
    const admin = createAdminSupabase()
    const { data: members } = await admin
      .from('flat_members')
      .select('user_id')
      .eq('flat_id', visitor.flat_id)
      .eq('status', 'active')

    if (!members?.length) return

    const label = visitor.kind === 'courier' ? 'A delivery' : visitor.full_name

    await admin.from('notifications').insert(
      members.map((member) => ({
        user_id: member.user_id,
        event: `visitor.${what}`,
        title: `${label} is at the gate`,
        body: visitor.purpose ?? undefined,
        link: '/visitors',
      })),
    )

    await admin
      .from('visitors')
      .update({ notified_at: new Date().toISOString() })
      .eq('id', visitor.id)
  } catch (error) {
    // A failed notification must not stop the gate from working.
    console.error('[gate] notification failed', error)
  }
}
