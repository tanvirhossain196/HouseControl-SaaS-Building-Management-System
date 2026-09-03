import { createHash, randomInt } from 'node:crypto'

import { OTP_MAX_ATTEMPTS } from './handover-windows'

export * from './handover-windows'

/**
 * Handover codes: generating them, storing them, and checking a guess.
 *
 * Server-only, because it touches `node:crypto`. The timing rules live in
 * `handover-windows.ts` and are re-exported here, so server code has one
 * import and client components can take the windows without the crypto.
 *
 * `npm run test:otp` covers both.
 */

/**
 * Six digits from a cryptographic source, leading zeros kept.
 *
 * `Math.random()` is predictable enough to guess given a few samples, which is
 * exactly the situation an attacker who owns one flat is in.
 */
export function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

/**
 * The code is stored as a hash, salted with the transfer's own id and a
 * server-side secret. The id means two transfers with the same code hash
 * differently; the secret means a leaked database row is not enough to
 * reconstruct a working code.
 */
export function hashOtp(code: string, transferId: string, secret: string): string {
  return createHash('sha256').update(`${transferId}:${code}:${secret}`).digest('hex')
}

/** Constant-time comparison, so a wrong code does not leak how wrong it was. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index)
  }
  return diff === 0
}

export type OtpState = {
  otpHash: string | null
  otpExpiresAt: string | null
  otpAttempts: number
}

export type OtpCheck =
  | { ok: true }
  | {
      ok: false
      reason: 'no_code' | 'expired' | 'locked' | 'wrong'
      attemptsLeft: number
    }

/**
 * Checks a code against stored state.
 *
 * The order is deliberate: lockout and expiry are decided before the code is
 * compared, so a locked or expired transfer gives the same answer regardless
 * of whether the guess happened to be right.
 */
export function checkOtp(
  input: string,
  state: OtpState,
  transferId: string,
  secret: string,
  now: Date = new Date(),
): OtpCheck {
  if (!state.otpHash || !state.otpExpiresAt) {
    return { ok: false, reason: 'no_code', attemptsLeft: 0 }
  }

  if (state.otpAttempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, reason: 'locked', attemptsLeft: 0 }
  }

  if (new Date(state.otpExpiresAt).getTime() <= now.getTime()) {
    return {
      ok: false,
      reason: 'expired',
      attemptsLeft: OTP_MAX_ATTEMPTS - state.otpAttempts,
    }
  }

  const matches = safeEqual(hashOtp(input, transferId, secret), state.otpHash)
  if (matches) return { ok: true }

  return {
    ok: false,
    reason: 'wrong',
    attemptsLeft: Math.max(0, OTP_MAX_ATTEMPTS - state.otpAttempts - 1),
  }
}
