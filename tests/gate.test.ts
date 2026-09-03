/**
 * Gate codes and the small rules around a visit.
 *
 * The entry code is what lets a stranger past a guard without a phone call
 * upstairs, so its alphabet, its lifetime and the way it is matched all
 * matter more than they look.
 *
 *   npm run test:gate
 */
import assert from 'node:assert/strict'
import {
  codeExpired,
  codeExpiryFrom,
  durationSince,
  ENTRY_CODE_ALPHABET,
  ENTRY_CODE_LENGTH,
  formatEntryCode,
  isValidCodeShape,
  KIND_LABELS,
  needsFlat,
  normalisePhone,
  normaliseEntryCode,
  samePhone,
  visitIsStale,
} from '../src/lib/gate'
import { generateEntryCode } from '../src/lib/gate-codes'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

const now = new Date('2026-09-03T14:00:00Z')

console.log('entry codes')

check('the alphabet has no characters a guard could misread', () => {
  // 0/O, 1/I/L are the pairs that get read out wrong over a gate intercom.
  for (const character of '01OIL') {
    assert.ok(
      !ENTRY_CODE_ALPHABET.includes(character),
      `${character} is ambiguous and should not be in the alphabet`,
    )
  }
})

check('codes are the right length and drawn from that alphabet', () => {
  for (let i = 0; i < 200; i += 1) {
    const code = generateEntryCode()
    assert.equal(code.length, ENTRY_CODE_LENGTH)
    for (const character of code) {
      assert.ok(
        ENTRY_CODE_ALPHABET.includes(character),
        `${character} is not in the alphabet`,
      )
    }
  }
})

check('codes do not repeat in normal use', () => {
  const codes = new Set(Array.from({ length: 500 }, generateEntryCode))
  assert.ok(codes.size > 480, `only ${codes.size} distinct codes in 500 draws`)
})

check('codes are shown grouped and typed back in any form', () => {
  const code = 'KF72M9'
  assert.equal(formatEntryCode(code), 'KF7-2M9')
  // A guard reading it off a phone screen types the dash, or lowercase, or both.
  assert.equal(normaliseEntryCode('kf7-2m9'), code)
  assert.equal(normaliseEntryCode(' KF7 2M9 '), code)
  assert.equal(normaliseEntryCode('KF72M9'), code)
})

check('a wrongly shaped code is rejected before it reaches the database', () => {
  assert.equal(isValidCodeShape('KF72M9'), true)
  assert.equal(isValidCodeShape('KF7-2M9'), true)
  assert.equal(isValidCodeShape('KF72M'), false, 'too short')
  assert.equal(isValidCodeShape('KF72M90'), false, 'too long')
  assert.equal(isValidCodeShape('KF72O9'), false, 'O is not in the alphabet')
  assert.equal(isValidCodeShape(''), false)
})

check('a code dies after twelve hours whether or not it was used', () => {
  const expires = codeExpiryFrom(now)
  assert.equal(codeExpired(expires, now), false)
  assert.equal(codeExpired(expires, new Date(now.getTime() + 11 * 60 * 60_000)), false)
  assert.equal(codeExpired(expires, new Date(now.getTime() + 13 * 60 * 60_000)), true)
  assert.equal(codeExpired(null, now), true, 'no expiry means no valid code')
})

console.log('\nphone numbers')

check('the same number written five ways is one number', () => {
  const forms = [
    '01712345678',
    '+8801712345678',
    '8801712345678',
    '017 1234 5678',
    '017-123-45678',
  ]
  const normalised = forms.map((form) => normalisePhone(form))
  assert.ok(
    normalised.every((value) => value === normalised[0]),
    `got ${JSON.stringify(normalised)}`,
  )
})

check('a blocked number matches however the guard types it', () => {
  // This is the one that matters: a block is useless if +880 defeats it.
  assert.equal(samePhone('+8801712345678', '01712345678'), true)
  assert.equal(samePhone('01712345678', '01712345679'), false)
  assert.equal(samePhone(null, '01712345678'), false)
  assert.equal(
    samePhone(null, null),
    false,
    'two unknown numbers are not the same person',
  )
})

check('rubbish is not treated as a phone number', () => {
  assert.equal(normalisePhone('12345'), null)
  assert.equal(normalisePhone(''), null)
  assert.equal(normalisePhone(null), null)
})

console.log('\nvisits')

check('time inside reads as a person would say it', () => {
  const enteredAt = (minutes: number) =>
    new Date(now.getTime() - minutes * 60_000).toISOString()

  assert.equal(durationSince(enteredAt(0), now), 'just now')
  assert.equal(durationSince(enteredAt(25), now), '25m')
  assert.equal(durationSince(enteredAt(90), now), '1h 30m')
  assert.equal(durationSince(enteredAt(180), now), '3h')
  assert.equal(durationSince(null, now), '—')
})

check('somebody still marked inside after half a day is flagged', () => {
  // Almost always a guard who forgot to mark them out, not a squatter.
  const twoHours = new Date(now.getTime() - 2 * 60 * 60_000).toISOString()
  const halfDay = new Date(now.getTime() - 13 * 60 * 60_000).toISOString()

  assert.equal(visitIsStale(twoHours, now), false)
  assert.equal(visitIsStale(halfDay, now), true)
  assert.equal(visitIsStale(null, now), false)
})

check('a courier needs a flat; a building visit does not', () => {
  assert.equal(needsFlat('guest'), true)
  assert.equal(needsFlat('courier'), true)
  assert.equal(needsFlat('staff'), false, 'staff come for the building')
  assert.equal(needsFlat('other'), false)
})

check('every kind of visit has a label the guard will recognise', () => {
  for (const kind of ['guest', 'courier', 'service', 'staff', 'other'] as const) {
    assert.ok(KIND_LABELS[kind]?.length > 2, `${kind} has no label`)
  }
})

console.log(`\n${passed} checks passed`)
