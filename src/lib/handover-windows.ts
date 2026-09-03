/**
 * The timing rules around a moderator handover.
 *
 * Separate from `otp.ts` because the UI needs them too: a client component
 * importing anything that touches `node:crypto` breaks the bundle, and the
 * "can this still be undone" question belongs on both sides.
 */

export const OTP_TTL_MS = 10 * 60_000

/** Five wrong guesses and the transfer is dead. A six-digit code has a million values. */
export const OTP_MAX_ATTEMPTS = 5

/** The other person has two days to accept before the offer lapses. */
export const TRANSFER_TTL_MS = 48 * 60 * 60_000

/** The owner has a week to undo a handover that should not have happened. */
export const ROLLBACK_WINDOW_MS = 7 * 24 * 60 * 60_000

/** A code cannot be re-sent more than once a minute. */
export const OTP_RESEND_COOLDOWN_MS = 60_000

export function otpExpiryFrom(now: Date = new Date()): string {
  return new Date(now.getTime() + OTP_TTL_MS).toISOString()
}

export function transferExpiryFrom(now: Date = new Date()): string {
  return new Date(now.getTime() + TRANSFER_TTL_MS).toISOString()
}

export function rollbackDeadlineFrom(now: Date = new Date()): string {
  return new Date(now.getTime() + ROLLBACK_WINDOW_MS).toISOString()
}

/** Whether an accepted handover can still be undone. */
export function withinRollbackWindow(
  deadline: string | null,
  now: Date = new Date(),
): boolean {
  if (!deadline) return false
  return new Date(deadline).getTime() > now.getTime()
}

/** Seconds until another code may be sent. Zero means now. */
export function resendWaitSeconds(sentAt: string | null, now: Date = new Date()): number {
  if (!sentAt) return 0
  const elapsed = now.getTime() - new Date(sentAt).getTime()
  return Math.max(0, Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1000))
}

/** Whether a pending offer has lapsed. */
export function transferExpired(expiresAt: string, now: Date = new Date()): boolean {
  return new Date(expiresAt).getTime() <= now.getTime()
}

/** Masks a phone number for the "we sent a code to …" line. */
export function maskPhone(phone: string | null): string {
  if (!phone) return 'your verified number'
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 6) return 'your verified number'
  return `${digits.slice(0, 3)}\u2022\u2022\u2022\u2022${digits.slice(-3)}`
}
