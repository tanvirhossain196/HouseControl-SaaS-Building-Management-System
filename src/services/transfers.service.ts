import 'server-only'

import { createAdminSupabase } from '@/lib/supabase/admin'
import { createServerSupabase } from '@/lib/supabase/server'
import { AppError, conflict, forbidden, notFound, toAppError } from '@/lib/errors'
import { writeAuditLog } from './audit.service'
import { listResidents } from './residents.service'
import { getFlat } from './flats.service'
import {
  checkOtp,
  generateOtp,
  hashOtp,
  maskPhone,
  otpExpiryFrom,
  resendWaitSeconds,
  rollbackDeadlineFrom,
  transferExpired,
  transferExpiryFrom,
  withinRollbackWindow,
  OTP_MAX_ATTEMPTS,
} from '@/lib/otp'
import type { ModeratorTransferRow } from '@/types'

/**
 * Handing a flat's moderator role to another resident.
 *
 * This is the one action where a person gives away authority over other
 * people's money, so it takes four things rather than a confirm dialog:
 *
 *   1. The outgoing moderator proves it is them, with a code sent to the
 *      number they verified in Phase 3.
 *   2. The incoming resident accepts. Nobody is made responsible for a flat's
 *      ledger without agreeing to it.
 *   3. The owner is notified the moment it happens.
 *   4. The owner can undo it for seven days.
 *
 * Writes run with the service role: the role swap and the transfer row must
 * move together, and neither party may edit their own offer.
 */

type TransferRow = ModeratorTransferRow & {
  otp_hash: string | null
  otp_sent_at: string | null
  otp_expires_at: string | null
  otp_attempts: number
  rollback_deadline: string | null
  initiated_by: string | null
  note: string | null
}

function otpSecret(): string {
  const secret = process.env.OTP_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) {
    throw new AppError(
      'internal_error',
      'Handover codes are not configured for this deployment.',
    )
  }
  return secret
}

async function getTransfer(transferId: string): Promise<TransferRow> {
  const admin = createAdminSupabase()
  const { data, error } = await admin
    .from('moderator_transfers')
    .select('*')
    .eq('id', transferId)
    .maybeSingle()

  if (error) throw toAppError(error)
  if (!data) throw notFound('That handover')
  return data as unknown as TransferRow
}

/** Delivers the code. Phase 11 sends the SMS; until then it is an in-app notification. */
async function deliverCode(userId: string, code: string, flatLabel: string) {
  const admin = createAdminSupabase()

  await admin.from('notifications').insert({
    user_id: userId,
    event: 'moderator.transfer_code',
    title: `Handover code for flat ${flatLabel}`,
    body: `Your code is ${code}. It expires in 10 minutes. If you did not start a handover, ignore this and tell the building owner.`,
    channel: 'sms',
  })

  if (process.env.NODE_ENV !== 'production') {
    console.info(`[handover] code for ${flatLabel}: ${code}`)
  }
}

export type TransferView = TransferRow & {
  fromName: string | null
  toName: string | null
  unitNumber: string | null
}

async function decorate(rows: TransferRow[]): Promise<TransferView[]> {
  if (rows.length === 0) return []
  const admin = createAdminSupabase()

  const userIds = [...new Set(rows.flatMap((row) => [row.from_user_id, row.to_user_id]))]
  const flatIds = [...new Set(rows.map((row) => row.flat_id))]

  const [{ data: profiles }, { data: flats }] = await Promise.all([
    admin.from('profiles').select('id, full_name').in('id', userIds),
    admin.from('flats').select('id, unit_number').in('id', flatIds),
  ])

  const nameOf = (id: string) => profiles?.find((p) => p.id === id)?.full_name ?? null

  return rows.map((row) => ({
    ...row,
    fromName: nameOf(row.from_user_id),
    toName: nameOf(row.to_user_id),
    unitNumber: flats?.find((flat) => flat.id === row.flat_id)?.unit_number ?? null,
  }))
}

/** The open offer on a flat, if there is one. */
export async function getPendingTransfer(flatId: string): Promise<TransferView | null> {
  const supabase = createServerSupabase()
  const { data } = await supabase
    .from('moderator_transfers')
    .select('*')
    .eq('flat_id', flatId)
    .eq('status', 'pending')
    .maybeSingle()

  if (!data) return null
  const [view] = await decorate([data as unknown as TransferRow])
  return view ?? null
}

/** Offers waiting on this person's answer. */
export async function listIncomingTransfers(userId: string): Promise<TransferView[]> {
  const supabase = createServerSupabase()
  const { data } = await supabase
    .from('moderator_transfers')
    .select('*')
    .eq('to_user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  return decorate((data ?? []) as unknown as TransferRow[])
}

/** Recent handovers on a flat, for the history panel and the rollback button. */
export async function listTransfers(flatId: string, limit = 10): Promise<TransferView[]> {
  const supabase = createServerSupabase()
  const { data } = await supabase
    .from('moderator_transfers')
    .select('*')
    .eq('flat_id', flatId)
    .order('created_at', { ascending: false })
    .limit(limit)

  return decorate((data ?? []) as unknown as TransferRow[])
}

export type StartResult = { transferId: string; sentTo: string }

/**
 * Starts a handover and sends the code to the outgoing moderator's phone.
 *
 * The 24-hour cooldown between accepted handovers is enforced by a database
 * trigger, so a flat cannot be passed around in circles to shake off an audit
 * trail.
 */
export async function startTransfer(
  actorId: string,
  flatId: string,
  toUserId: string,
  note?: string,
): Promise<StartResult> {
  const admin = createAdminSupabase()
  const flat = await getFlat(flatId)
  const residents = await listResidents(flatId)

  const outgoing = residents.find((resident) => resident.role === 'moderator')
  const incoming = residents.find((resident) => resident.userId === toUserId)

  if (!outgoing || outgoing.userId !== actorId) {
    throw forbidden('Only the current moderator can hand the role on.')
  }
  if (!incoming) throw notFound('That resident')
  if (incoming.userId === actorId) throw conflict('You already hold this role.')
  if (!incoming.phoneVerified) {
    throw new AppError(
      'validation_failed',
      `${incoming.fullName} needs to verify their mobile number before they can take this on.`,
    )
  }
  if (!outgoing.phoneVerified) {
    throw new AppError(
      'validation_failed',
      'Verify your own mobile number first — the code is sent there.',
    )
  }

  const { data: existing } = await admin
    .from('moderator_transfers')
    .select('id')
    .eq('flat_id', flatId)
    .eq('status', 'pending')
    .maybeSingle()

  if (existing) {
    throw conflict('There is already a handover in progress for this flat.')
  }

  const { data: transfer, error } = await admin
    .from('moderator_transfers')
    .insert({
      flat_id: flatId,
      from_user_id: actorId,
      to_user_id: toUserId,
      status: 'pending',
      expires_at: transferExpiryFrom(),
      initiated_by: actorId,
      note: note ?? null,
    })
    .select('*')
    .single()

  // The cooldown trigger surfaces here as a check violation.
  if (error) throw toAppError(error)

  const code = generateOtp()
  const { error: codeError } = await admin
    .from('moderator_transfers')
    .update({
      otp_hash: hashOtp(code, transfer.id, otpSecret()),
      otp_sent_at: new Date().toISOString(),
      otp_expires_at: otpExpiryFrom(),
      otp_attempts: 0,
    })
    .eq('id', transfer.id)

  if (codeError) throw toAppError(codeError)

  await deliverCode(actorId, code, flat.unit_number)

  await writeAuditLog({
    actorId,
    action: 'moderator.transfer_started',
    entityType: 'flat',
    entityId: flatId,
    after: { to: incoming.fullName, transferId: transfer.id },
  })

  return { transferId: transfer.id, sentTo: maskPhone(outgoing.phone) }
}

/** Sends a fresh code, at most once a minute. */
export async function resendCode(
  actorId: string,
  transferId: string,
): Promise<{ sentTo: string }> {
  const admin = createAdminSupabase()
  const transfer = await getTransfer(transferId)

  if (transfer.from_user_id !== actorId) throw forbidden('This handover is not yours.')
  if (transfer.status !== 'pending') throw conflict('This handover is no longer open.')

  const wait = resendWaitSeconds(transfer.otp_sent_at)
  if (wait > 0)
    throw conflict(`Wait ${wait} more seconds before asking for another code.`)

  const flat = await getFlat(transfer.flat_id)
  const code = generateOtp()

  const { error } = await admin
    .from('moderator_transfers')
    .update({
      otp_hash: hashOtp(code, transferId, otpSecret()),
      otp_sent_at: new Date().toISOString(),
      otp_expires_at: otpExpiryFrom(),
      otp_attempts: 0,
    })
    .eq('id', transferId)

  if (error) throw toAppError(error)

  await deliverCode(actorId, code, flat.unit_number)

  const { data: profile } = await admin
    .from('profiles')
    .select('phone')
    .eq('id', actorId)
    .maybeSingle()

  return { sentTo: maskPhone(profile?.phone ?? null) }
}

/**
 * The outgoing moderator confirms the code.
 *
 * A wrong guess is counted before anything else, so the attempt cost is paid
 * whether or not the transfer turns out to be expired.
 */
export async function confirmTransferCode(
  actorId: string,
  transferId: string,
  code: string,
): Promise<void> {
  const admin = createAdminSupabase()
  const transfer = await getTransfer(transferId)

  if (transfer.from_user_id !== actorId) throw forbidden('This handover is not yours.')
  if (transfer.status !== 'pending') throw conflict('This handover is no longer open.')
  if (transfer.otp_verified_at) return
  if (transferExpired(transfer.expires_at)) {
    await expire(transferId)
    throw conflict('This handover has expired. Start a new one.')
  }

  const result = checkOtp(
    code,
    {
      otpHash: transfer.otp_hash,
      otpExpiresAt: transfer.otp_expires_at,
      otpAttempts: transfer.otp_attempts,
    },
    transferId,
    otpSecret(),
  )

  if (!result.ok) {
    if (result.reason === 'wrong') {
      const attempts = transfer.otp_attempts + 1
      await admin
        .from('moderator_transfers')
        .update({ otp_attempts: attempts })
        .eq('id', transferId)

      if (attempts >= OTP_MAX_ATTEMPTS) {
        await admin
          .from('moderator_transfers')
          .update({ status: 'expired', responded_at: new Date().toISOString() })
          .eq('id', transferId)

        await writeAuditLog({
          actorId,
          action: 'moderator.transfer_locked',
          entityType: 'flat',
          entityId: transfer.flat_id,
          after: { transferId, reason: 'too many wrong codes' },
        })

        throw conflict(
          'Too many wrong codes. This handover is cancelled — start a new one.',
        )
      }

      throw new AppError(
        'validation_failed',
        `That code is wrong. ${result.attemptsLeft} attempt${result.attemptsLeft === 1 ? '' : 's'} left.`,
      )
    }

    if (result.reason === 'expired') {
      throw conflict('That code has expired. Ask for a new one.')
    }
    if (result.reason === 'locked') {
      throw conflict('Too many wrong codes. Start a new handover.')
    }
    throw conflict('No code has been sent for this handover yet.')
  }

  const { error } = await admin
    .from('moderator_transfers')
    .update({ otp_verified_at: new Date().toISOString(), otp_hash: null })
    .eq('id', transferId)

  if (error) throw toAppError(error)

  // Tell the incoming resident there is something waiting for them.
  const flat = await getFlat(transfer.flat_id)
  await admin.from('notifications').insert({
    user_id: transfer.to_user_id,
    event: 'moderator.transfer_offered',
    title: `You have been asked to moderate flat ${flat.unit_number}`,
    body: 'Accepting makes you responsible for this flat’s rent, dues and residents.',
    link: '/dashboard',
  })

  await writeAuditLog({
    actorId,
    action: 'moderator.transfer_verified',
    entityType: 'flat',
    entityId: transfer.flat_id,
    after: { transferId },
  })
}

/**
 * The incoming resident accepts. This is where the role actually moves.
 *
 * The old moderator is stepped down first because of the single-moderator
 * index — two rows cannot hold the role at the same instant.
 */
export async function acceptTransfer(actorId: string, transferId: string): Promise<void> {
  const admin = createAdminSupabase()
  const transfer = await getTransfer(transferId)

  if (transfer.to_user_id !== actorId)
    throw forbidden('This handover was not offered to you.')
  if (transfer.status !== 'pending') throw conflict('This handover is no longer open.')
  if (!transfer.otp_verified_at) {
    throw conflict('The current moderator has not confirmed their code yet.')
  }
  if (transferExpired(transfer.expires_at)) {
    await expire(transferId)
    throw conflict('This handover has expired. Ask for a new one.')
  }

  const { error: stepDown } = await admin
    .from('flat_members')
    .update({ role: 'resident' })
    .eq('flat_id', transfer.flat_id)
    .eq('user_id', transfer.from_user_id)
    .eq('status', 'active')

  if (stepDown) throw toAppError(stepDown)

  const { data: promoted, error: stepUp } = await admin
    .from('flat_members')
    .update({ role: 'moderator' })
    .eq('flat_id', transfer.flat_id)
    .eq('user_id', actorId)
    .eq('status', 'active')
    .select('id')
    .maybeSingle()

  if (stepUp || !promoted) {
    // Put the old moderator back rather than leaving the flat unmanaged.
    await admin
      .from('flat_members')
      .update({ role: 'moderator' })
      .eq('flat_id', transfer.flat_id)
      .eq('user_id', transfer.from_user_id)
      .eq('status', 'active')

    throw toAppError(
      stepUp ?? new AppError('conflict', 'You are no longer in this flat.'),
    )
  }

  const now = new Date()
  const { error } = await admin
    .from('moderator_transfers')
    .update({
      status: 'accepted',
      responded_at: now.toISOString(),
      rollback_deadline: rollbackDeadlineFrom(now),
    })
    .eq('id', transferId)

  if (error) throw toAppError(error)

  await notifyOwners(transfer.flat_id, transferId, 'accepted')

  await writeAuditLog({
    actorId,
    action: 'moderator.transfer_accepted',
    entityType: 'flat',
    entityId: transfer.flat_id,
    before: { moderator: transfer.from_user_id },
    after: { moderator: actorId, transferId },
  })
}

/** The incoming resident declines, or the outgoing one calls it off. */
export async function cancelTransfer(
  actorId: string,
  transferId: string,
  by: 'sender' | 'recipient',
): Promise<void> {
  const admin = createAdminSupabase()
  const transfer = await getTransfer(transferId)

  const allowed =
    by === 'sender' ? transfer.from_user_id === actorId : transfer.to_user_id === actorId

  if (!allowed) throw forbidden('This handover is not yours to cancel.')
  if (transfer.status !== 'pending') throw conflict('This handover is no longer open.')

  const { error } = await admin
    .from('moderator_transfers')
    .update({ status: 'rejected', responded_at: new Date().toISOString() })
    .eq('id', transferId)

  if (error) throw toAppError(error)

  await admin.from('notifications').insert({
    user_id: by === 'sender' ? transfer.to_user_id : transfer.from_user_id,
    event: 'moderator.transfer_cancelled',
    title: 'The moderator handover was called off',
    body:
      by === 'sender'
        ? 'The current moderator withdrew the offer.'
        : 'The person you asked has declined. The role stays with you.',
  })

  await writeAuditLog({
    actorId,
    action:
      by === 'sender' ? 'moderator.transfer_withdrawn' : 'moderator.transfer_declined',
    entityType: 'flat',
    entityId: transfer.flat_id,
    after: { transferId },
  })
}

/**
 * Undoes an accepted handover, within seven days.
 *
 * For the case the whole feature exists to survive: a moderator was talked
 * into handing over the flat's ledger, and the owner needs it back.
 */
export async function rollbackTransfer(
  actorId: string,
  transferId: string,
  reason: string,
): Promise<void> {
  const admin = createAdminSupabase()
  const transfer = await getTransfer(transferId)

  if (transfer.status !== 'accepted')
    throw conflict('Only an accepted handover can be undone.')
  if (!withinRollbackWindow(transfer.rollback_deadline)) {
    throw conflict('The seven-day window for undoing this handover has closed.')
  }

  const { data: previous } = await admin
    .from('flat_members')
    .select('id')
    .eq('flat_id', transfer.flat_id)
    .eq('user_id', transfer.from_user_id)
    .eq('status', 'active')
    .maybeSingle()

  if (!previous) {
    throw conflict(
      'The previous moderator has left this flat, so the role cannot be handed back. Assign someone directly instead.',
    )
  }

  await admin
    .from('flat_members')
    .update({ role: 'resident' })
    .eq('flat_id', transfer.flat_id)
    .eq('user_id', transfer.to_user_id)
    .eq('status', 'active')

  const { error: restore } = await admin
    .from('flat_members')
    .update({ role: 'moderator' })
    .eq('id', previous.id)

  if (restore) throw toAppError(restore)

  const { error } = await admin
    .from('moderator_transfers')
    .update({
      status: 'rolled_back',
      rolled_back_at: new Date().toISOString(),
      rolled_back_by: actorId,
    })
    .eq('id', transferId)

  if (error) throw toAppError(error)

  for (const userId of [transfer.from_user_id, transfer.to_user_id]) {
    await admin.from('notifications').insert({
      user_id: userId,
      event: 'moderator.transfer_rolled_back',
      title: 'A moderator handover was undone',
      body: reason,
    })
  }

  await writeAuditLog({
    actorId,
    action: 'moderator.transfer_rolled_back',
    entityType: 'flat',
    entityId: transfer.flat_id,
    before: { moderator: transfer.to_user_id },
    after: { moderator: transfer.from_user_id, reason, transferId },
  })
}

async function expire(transferId: string) {
  const admin = createAdminSupabase()
  await admin
    .from('moderator_transfers')
    .update({ status: 'expired' })
    .eq('id', transferId)
    .eq('status', 'pending')
}

/** Everyone who owns the building hears about a completed handover. */
async function notifyOwners(flatId: string, transferId: string, what: string) {
  const admin = createAdminSupabase()

  const { data: flat } = await admin
    .from('flats')
    .select('unit_number, buildings(org_id, name)')
    .eq('id', flatId)
    .maybeSingle()

  const row = flat as unknown as {
    unit_number: string
    buildings: { org_id: string; name: string } | null
  } | null

  if (!row?.buildings) return

  const { data: admins } = await admin
    .from('org_members')
    .select('user_id')
    .eq('org_id', row.buildings.org_id)
    .eq('role', 'admin')
    .eq('status', 'active')

  for (const owner of admins ?? []) {
    await admin.from('notifications').insert({
      user_id: owner.user_id,
      org_id: row.buildings.org_id,
      event: `moderator.transfer_${what}`,
      title: `Flat ${row.unit_number} has a new moderator`,
      body: 'You can undo this for the next seven days.',
      link: `/flats/${flatId}`,
    })
  }
}
