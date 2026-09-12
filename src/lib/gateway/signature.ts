import { createHash } from 'node:crypto'

/**
 * IPN signature verification, kept apart from the rest of the gateway code so
 * it can be tested on its own — this is the function that decides whether a
 * stranger can mark rent as paid.
 *
 * SSLCommerz sends `verify_key`, a comma-separated list of the fields that were
 * signed, and `verify_sign`, an MD5 digest over those fields.
 */

export type IpnPayload = Record<string, string | undefined>

const md5 = (value: string) => createHash('md5').update(value).digest('hex')

/** Constant-time comparison of two hex digests. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index)
  }
  return diff === 0
}

/**
 * Builds the string SSLCommerz hashes.
 *
 * The detail that is easy to get wrong: the MD5 of the store password is added
 * to the set as a field named `store_passwd` and then everything is sorted
 * together. It is not appended at the end. Fields like `tran_id`, `val_id` and
 * `value_a` sort after `store_passwd`, so appending puts them on the wrong side
 * of it and the digest never matches. This mirrors the reference
 * implementation, which does ksort() after adding the password.
 *
 * Sorting is plain byte order, the same as PHP's ksort on string keys — not a
 * locale-aware comparison.
 */
function hashString(
  fields: Array<[string, string]>,
  storePassword: string,
): string {
  const entries: Array<[string, string]> = [
    ...fields,
    ['store_passwd', md5(storePassword)],
  ]

  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))

  return entries.map(([key, value]) => `${key}=${value}`).join('&')
}

/**
 * True when the payload is authentic and unaltered.
 *
 * Only the fields named in `verify_key` are hashed. A field named there but
 * absent from the payload is skipped, as the reference implementation does —
 * dropping a field cannot help a forger, because the signature was computed
 * over the full set and our digest would no longer match it.
 */
export function verifyIpnSignature(payload: IpnPayload, storePassword: string): boolean {
  const verifyKey = payload.verify_key
  const verifySign = payload.verify_sign

  if (!verifyKey || !verifySign) return false

  const fields = verifyKey
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean)

  if (fields.length === 0) return false

  const present = fields
    .filter((field) => payload[field] !== undefined)
    .map((field) => [field, payload[field] as string] as [string, string])

  if (present.length === 0) return false

  const expected = md5(hashString(present, storePassword))

  return timingSafeEqualHex(expected, verifySign.toLowerCase())
}

/** Builds the signature the way SSLCommerz does — used by the tests. */
export function signIpnPayload(
  payload: Record<string, string>,
  fields: string[],
  storePassword: string,
): { verify_key: string; verify_sign: string } {
  const entries = fields.map(
    (field) => [field, payload[field] ?? ''] as [string, string],
  )

  return {
    verify_key: fields.join(','),
    verify_sign: md5(hashString(entries, storePassword)),
  }
}

/**
 * Our own transaction id: readable in a bank statement, unique, and carrying
 * no personal data.
 */
export function newTransactionId(
  flatId: string,
  now = Date.now(),
  random = Math.random(),
): string {
  const flatPart = flatId.replace(/-/g, '').slice(-4).toUpperCase()
  const time = now.toString(36).toUpperCase()
  const suffix = random.toString(36).slice(2, 6).toUpperCase().padEnd(4, 'X')
  return `HC${flatPart}${time}${suffix}`
}