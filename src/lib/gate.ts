/**
 * Gate arithmetic: entry codes, phone matching, and how a visit reads on a
 * screen.
 *
 * The guard is standing at a gate on a phone, often on a weak signal, with
 * someone waiting in front of them. Every rule here is shaped by that: codes
 * that cannot be misheard, phone matching that survives how people actually
 * type numbers, and durations that read at a glance.
 *
 * `npm run test:gate` covers it. Code generation lives in `gate-codes.ts`
 * because it needs `node:crypto`, which must not reach the browser bundle.
 */

/**
 * No O/0, I/1, L/1, S/5, B/8 — a code is read aloud over a phone or shouted
 * through a gate, and those are the pairs that get confused. L goes with I and
 * 1: a hand-written or low-resolution L is the same shape.
 */
const CODE_ALPHABET = 'ACDEFGHJKMNPQRTUVWXY2346789'

/** How long a pre-approval code lives once issued. */
export const CODE_TTL_MS = 12 * 60 * 60_000

export const ENTRY_CODE_ALPHABET = CODE_ALPHABET
export const ENTRY_CODE_LENGTH = 6

/** For display and for reading aloud. */
export function formatEntryCode(code: string): string {
  const clean = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  return clean.length === 6 ? `${clean.slice(0, 3)}-${clean.slice(3)}` : clean
}

/**
 * What the guard typed, turned into what is stored.
 *
 * Dashes, spaces and lower case are forgiven, because a code read aloud gets
 * typed back in every shape. Nothing else is guessed at: the alphabet has no
 * ambiguous characters in it, so a `0` or an `O` in the input is a mistake to
 * report rather than a letter to fold.
 */
export function normaliseEntryCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** Whether the guard has typed something that could be a code at all. */
export function isValidCodeShape(input: string): boolean {
  const code = normaliseEntryCode(input)
  if (code.length !== ENTRY_CODE_LENGTH) return false
  return [...code].every((character) => CODE_ALPHABET.includes(character))
}

/**
 * Bangladeshi mobile numbers, reduced to the eleven digits that identify them.
 *
 * `+8801712345678`, `8801712345678`, `01712345678` and `01712-345678` are one
 * person. The blocklist and the "has this courier been here before" lookup
 * both depend on that being true.
 */
export function normalisePhone(phone: string | null | undefined): string | null {
  if (!phone) return null

  const digits = phone.replace(/\D/g, '')
  const local = digits.startsWith('880')
    ? `0${digits.slice(3)}`
    : digits.startsWith('88')
      ? digits.slice(2)
      : digits

  return /^01[3-9]\d{8}$/.test(local) ? local : null
}

export function samePhone(a: string | null, b: string | null): boolean {
  const left = normalisePhone(a)
  const right = normalisePhone(b)
  return left !== null && left === right
}

export function codeExpiryFrom(now: Date = new Date(), ttl = CODE_TTL_MS): string {
  return new Date(now.getTime() + ttl).toISOString()
}

/**
 * A code with no expiry is treated as expired, not as eternal.
 *
 * Rows created before `code_expires_at` existed have none, and the safe
 * reading of "we do not know when this stops working" at a gate is that it
 * already has. The resident can issue a new one in seconds.
 */
export function codeExpired(expiresAt: string | null, now: Date = new Date()): boolean {
  if (!expiresAt) return true
  return new Date(expiresAt).getTime() <= now.getTime()
}

/** "2h 15m", "45m", "just now" — for the "inside now" list. */
export function durationSince(from: string | null, now: Date = new Date()): string {
  if (!from) return '—'

  const minutes = Math.floor((now.getTime() - new Date(from).getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m`

  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours < 24) return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`

  const days = Math.floor(hours / 24)
  return `${days}d ${hours % 24}h`
}

/**
 * Someone still inside long after they arrived is worth flagging — usually
 * they left without anyone marking them out, occasionally it matters.
 */
export const STALE_VISIT_HOURS = 12

export function visitIsStale(enteredAt: string | null, now: Date = new Date()): boolean {
  if (!enteredAt) return false
  return now.getTime() - new Date(enteredAt).getTime() > STALE_VISIT_HOURS * 60 * 60_000
}

export type VisitorKind = 'guest' | 'courier' | 'service' | 'staff' | 'other'

export const KIND_LABELS: Record<VisitorKind, string> = {
  guest: 'Guest',
  courier: 'Delivery',
  service: 'Service',
  staff: 'Staff',
  other: 'Other',
}

/**
 * A courier is not a guest: they visit a flat but the resident does not need
 * to approve them in advance, and they are expected to leave in minutes.
 */
export function needsFlat(kind: VisitorKind): boolean {
  return kind === 'guest' || kind === 'courier'
}

export function canPreApprove(kind: VisitorKind): boolean {
  return kind === 'guest' || kind === 'service'
}
