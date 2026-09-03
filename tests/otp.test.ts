/**
 * Handover codes and the timing rules around them.
 *
 * A moderator handover gives one resident control of another's ledger, so
 * these are the rules that decide whether it can be stolen: how a code is
 * stored, how many guesses it survives, when it dies, and how long the owner
 * has to undo the result.
 *
 *   npm run test:otp
 */
import assert from 'node:assert/strict'
import {
  checkOtp,
  generateOtp,
  hashOtp,
  maskPhone,
  otpExpiryFrom,
  resendWaitSeconds,
  rollbackDeadlineFrom,
  safeEqual,
  transferExpired,
  transferExpiryFrom,
  withinRollbackWindow,
  OTP_MAX_ATTEMPTS,
} from '../src/lib/otp'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

const SECRET = 'server-side-secret'
const TRANSFER = '11111111-1111-4111-8111-111111111111'
const OTHER_TRANSFER = '22222222-2222-4222-8222-222222222222'

const now = new Date('2026-09-03T10:00:00Z')
const state = (
  code: string,
  transferId = TRANSFER,
  attempts = 0,
  expiresIn = 5 * 60_000,
) => ({
  otpHash: hashOtp(code, transferId, SECRET),
  otpExpiresAt: new Date(now.getTime() + expiresIn).toISOString(),
  otpAttempts: attempts,
})

console.log('handover codes')

check('codes are six digits, leading zeros kept', () => {
  for (let i = 0; i < 200; i += 1) {
    const code = generateOtp()
    assert.match(code, /^\d{6}$/, `bad code: ${code}`)
  }
})

check('codes are not all the same and not obviously sequential', () => {
  const codes = new Set(Array.from({ length: 200 }, generateOtp))
  assert.ok(codes.size > 150, `only ${codes.size} distinct codes in 200 draws`)
})

check('the right code passes', () => {
  assert.deepEqual(checkOtp('123456', state('123456'), TRANSFER, SECRET, now), {
    ok: true,
  })
})

check('a wrong code fails and counts down the attempts', () => {
  const result = checkOtp('000000', state('123456'), TRANSFER, SECRET, now)
  assert.equal(result.ok, false)
  assert.ok(!result.ok && result.reason === 'wrong')
  assert.ok(!result.ok && result.attemptsLeft === OTP_MAX_ATTEMPTS - 1)
})

check('the same code from a different transfer does not work', () => {
  // The hash is salted with the transfer id, so a code seen once elsewhere
  // cannot be replayed against another flat's handover.
  const result = checkOtp(
    '123456',
    state('123456', OTHER_TRANSFER),
    TRANSFER,
    SECRET,
    now,
  )
  assert.equal(result.ok, false)
})

check('a stolen hash is useless without the server secret', () => {
  const leaked = state('123456')
  const attacker = checkOtp('123456', leaked, TRANSFER, 'guessed-secret', now)
  assert.equal(attacker.ok, false)
})

check('an expired code is refused even when it is right', () => {
  const expired = state('123456', TRANSFER, 0, -1000)
  const result = checkOtp('123456', expired, TRANSFER, SECRET, now)
  assert.equal(result.ok, false)
  assert.ok(!result.ok && result.reason === 'expired')
})

check('a locked transfer is refused even when the code is right', () => {
  const locked = state('123456', TRANSFER, OTP_MAX_ATTEMPTS)
  const result = checkOtp('123456', locked, TRANSFER, SECRET, now)
  assert.equal(result.ok, false)
  assert.ok(!result.ok && result.reason === 'locked')
})

check('lockout is decided before the code is compared', () => {
  // Right and wrong codes must be indistinguishable once locked, or the
  // lockout becomes an oracle for guessing.
  const locked = state('123456', TRANSFER, OTP_MAX_ATTEMPTS)
  const right = checkOtp('123456', locked, TRANSFER, SECRET, now)
  const wrong = checkOtp('999999', locked, TRANSFER, SECRET, now)
  assert.deepEqual(right, wrong)
})

check('a transfer with no code sent is refused', () => {
  const result = checkOtp(
    '123456',
    { otpHash: null, otpExpiresAt: null, otpAttempts: 0 },
    TRANSFER,
    SECRET,
    now,
  )
  assert.equal(result.ok, false)
  assert.ok(!result.ok && result.reason === 'no_code')
})

check('digest comparison is length-safe', () => {
  assert.equal(safeEqual('abc', 'abc'), true)
  assert.equal(safeEqual('abc', 'abcd'), false)
  assert.equal(safeEqual('abc', 'abd'), false)
})

console.log('\nhandover windows')

check('a code lives ten minutes, an offer two days', () => {
  const codeGap = new Date(otpExpiryFrom(now)).getTime() - now.getTime()
  const offerGap = new Date(transferExpiryFrom(now)).getTime() - now.getTime()
  assert.equal(codeGap, 10 * 60_000)
  assert.equal(offerGap, 48 * 60 * 60_000)
})

check('an offer lapses once its expiry passes', () => {
  const expires = transferExpiryFrom(now)
  assert.equal(transferExpired(expires, now), false)
  assert.equal(transferExpired(expires, new Date(now.getTime() + 49 * 60 * 60_000)), true)
})

check('the owner has seven days to undo, and not eight', () => {
  const deadline = rollbackDeadlineFrom(now)
  const sixDays = new Date(now.getTime() + 6 * 24 * 60 * 60_000)
  const eightDays = new Date(now.getTime() + 8 * 24 * 60 * 60_000)

  assert.equal(withinRollbackWindow(deadline, sixDays), true)
  assert.equal(withinRollbackWindow(deadline, eightDays), false)
  assert.equal(withinRollbackWindow(null, now), false, 'a pending transfer has no window')
})

check('codes cannot be re-sent more than once a minute', () => {
  const justSent = new Date(now.getTime() - 10_000).toISOString()
  assert.equal(resendWaitSeconds(justSent, now), 50)
  assert.equal(resendWaitSeconds(new Date(now.getTime() - 90_000).toISOString(), now), 0)
  assert.equal(resendWaitSeconds(null, now), 0)
})

check('the phone number is masked in the “code sent to” line', () => {
  assert.equal(maskPhone('01712345678'), '017••••678')
  assert.equal(maskPhone(null), 'your verified number')
  assert.equal(maskPhone('123'), 'your verified number')
})

console.log(`\n${passed} checks passed`)
