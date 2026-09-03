import { createHash } from 'node:crypto'

/**
 * IPN signature verification, kept apart from the rest of the gateway code so
 * it can be tested on its own — this is the function that decides whether a
 * stranger can mark rent as paid.
 *
 * SSLCommerz sends `verify_key`, a comma-separated list of the fields that
 * were signed, and `verify_sign`, the MD5 of those fields in alphabetical
 * order with the MD5 of the store password appended.
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
 * True when the payload is authentic and unaltered.
 *
 * Two details are easy to get wrong and both are load-bearing:
 *
 *   - Only the fields named in `verify_key` are hashed, in sorted order.
 *     Hashing everything in the request, or using the request's own order,
 *     never matches.
 *   - Every named field must be present. A missing one would hash as an empty
 *     string and let a truncated payload through.
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

  for (const field of fields) {
    if (payload[field] === undefined) return false
  }

  const parts = [...fields]
    .sort()
    .map((field) => `${field}=${payload[field]}`)
    .join('&')

  const expected = md5(`${parts}&store_passwd=${md5(storePassword)}`)

  return timingSafeEqualHex(expected, verifySign.toLowerCase())
}

/** Builds the signature the way SSLCommerz does — used by the tests. */
export function signIpnPayload(
  payload: Record<string, string>,
  fields: string[],
  storePassword: string,
): { verify_key: string; verify_sign: string } {
  const parts = [...fields]
    .sort()
    .map((field) => `${field}=${payload[field]}`)
    .join('&')

  return {
    verify_key: fields.join(','),
    verify_sign: md5(`${parts}&store_passwd=${md5(storePassword)}`),
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
