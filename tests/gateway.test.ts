/**
 * Webhook signature verification.
 *
 * This is the function that decides whether a stranger can mark rent as paid.
 * Every case below is an attack that has worked on somebody's payment
 * integration before.
 *
 *   npm run test:gateway
 */
import assert from 'node:assert/strict'
import {
  newTransactionId,
  signIpnPayload,
  timingSafeEqualHex,
  verifyIpnSignature,
} from '../src/lib/gateway/signature'
import {
  amountInWords,
  formatAmountForPdf,
  isWinAnsiSafe,
  toPdfSafe,
} from '../src/lib/receipt'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

const STORE_PASSWORD = 'testpass123'

const SIGNED_FIELDS = ['amount', 'currency', 'status', 'store_id', 'tran_id', 'val_id']

function genuineIpn(overrides: Record<string, string> = {}) {
  const base: Record<string, string> = {
    tran_id: 'HC1A2B3C4D',
    val_id: '2609031200000001',
    amount: '24500.00',
    currency: 'BDT',
    status: 'VALID',
    store_id: 'housecontrol',
    card_type: 'BKASH-BKash',
    bank_tran_id: '2609031200TEST',
    ...overrides,
  }
  return { ...base, ...signIpnPayload(base, SIGNED_FIELDS, STORE_PASSWORD) }
}

console.log('gateway callbacks')

check('a genuine callback verifies', () => {
  assert.equal(verifyIpnSignature(genuineIpn(), STORE_PASSWORD), true)
})

check('changing the amount after signing is rejected', () => {
  const forged = { ...genuineIpn(), amount: '1.00' }
  assert.equal(verifyIpnSignature(forged, STORE_PASSWORD), false)
})

check('changing the status to VALID after signing is rejected', () => {
  const forged = { ...genuineIpn({ status: 'FAILED' }), status: 'VALID' }
  assert.equal(verifyIpnSignature(forged, STORE_PASSWORD), false)
})

check('pointing the callback at another transaction is rejected', () => {
  const forged = { ...genuineIpn(), tran_id: 'HCSOMEONEELSE' }
  assert.equal(verifyIpnSignature(forged, STORE_PASSWORD), false)
})

check('a callback signed with the wrong store password is rejected', () => {
  const attacker = { ...genuineIpn() }
  assert.equal(verifyIpnSignature(attacker, 'not-our-password'), false)
})

check('a payload with no signature at all is rejected', () => {
  const { verify_sign, verify_key, ...unsigned } = genuineIpn()
  void verify_sign
  void verify_key
  assert.equal(verifyIpnSignature(unsigned, STORE_PASSWORD), false)
})

check('an empty verify_key is rejected rather than trivially passing', () => {
  const forged = {
    ...genuineIpn(),
    verify_key: '',
    verify_sign: 'd41d8cd98f00b204e9800998ecf8427e',
  }
  assert.equal(verifyIpnSignature(forged, STORE_PASSWORD), false)
})

check('dropping a signed field is rejected instead of hashing as empty', () => {
  // The classic truncation attack: remove `amount` and hope it hashes as ''.
  const genuine = genuineIpn()
  const truncated: Record<string, string | undefined> = { ...genuine }
  delete truncated.amount
  assert.equal(verifyIpnSignature(truncated, STORE_PASSWORD), false)
})

check('adding an unsigned field does not break a genuine callback', () => {
  // Providers add fields over time; only the named ones are hashed.
  const withExtra = { ...genuineIpn(), risk_level: '0', new_field_2027: 'whatever' }
  assert.equal(verifyIpnSignature(withExtra, STORE_PASSWORD), true)
})

check('field order in the request does not matter, only sorted order', () => {
  const genuine = genuineIpn()
  const reordered = Object.fromEntries(Object.entries(genuine).reverse())
  assert.equal(verifyIpnSignature(reordered, STORE_PASSWORD), true)
})

check('an uppercase signature from the provider still verifies', () => {
  const genuine = genuineIpn()
  const upper = { ...genuine, verify_sign: genuine.verify_sign.toUpperCase() }
  assert.equal(verifyIpnSignature(upper, STORE_PASSWORD), true)
})

check('digest comparison is length-safe', () => {
  assert.equal(timingSafeEqualHex('abc', 'abc'), true)
  assert.equal(timingSafeEqualHex('abc', 'abcd'), false)
  assert.equal(timingSafeEqualHex('abc', 'abd'), false)
})

check('transaction ids are unique and carry no personal data', () => {
  const flat = 'cccccccc-0000-4000-8000-000000000051'
  const first = newTransactionId(flat, 1_760_000_000_000, 0.123456)
  const second = newTransactionId(flat, 1_760_000_000_001, 0.987654)

  assert.notEqual(first, second)
  assert.match(first, /^HC[0-9A-Z]+$/)
  assert.ok(first.length <= 30, 'gateways cap tran_id length')
})

console.log('\nreceipts')

check('a Bangla name is detected as unprintable by a standard PDF font', () => {
  assert.equal(isWinAnsiSafe('Shirin Akter'), true)
  assert.equal(isWinAnsiSafe('শিরিন আক্তার'), false)
  assert.equal(isWinAnsiSafe('৳24,500'), false)
})

check('the taka sign becomes BDT rather than a broken glyph', () => {
  assert.equal(toPdfSafe('৳24,500'), 'BDT 24,500')
  assert.equal(formatAmountForPdf(24500), 'BDT 24,500.00')
})

check('an unprintable name degrades to a marker, never to a blank line', () => {
  assert.equal(toPdfSafe('শিরিন আক্তার'), '(name in Bangla)')
  assert.equal(toPdfSafe('Kamrul Hasan'), 'Kamrul Hasan')
})

check('amounts are written out in South Asian grouping', () => {
  assert.equal(amountInWords(24500), 'Taka Twenty-four thousand five hundred only')
  assert.equal(amountInWords(100000), 'Taka One lakh only')
  assert.equal(amountInWords(12500000), 'Taka One crore twenty-five lakh only')
  assert.equal(amountInWords(0), 'Taka zero only')
})

check('paisa are spelled out when they exist', () => {
  assert.equal(
    amountInWords(1500.5),
    'Taka One thousand five hundred and fifty paisa only',
  )
})

console.log(`\n${passed} checks passed`)
