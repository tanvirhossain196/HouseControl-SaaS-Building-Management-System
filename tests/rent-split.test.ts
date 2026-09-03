/**
 * Rent-splitting tests.
 *
 * Money that does not add up is the worst kind of bug in this product, so the
 * awkward divisions are checked explicitly.
 *
 *   npm run test:rent
 */
import assert from 'node:assert/strict'
import {
  checkShares,
  redistribute,
  splitByWeight,
  splitEqually,
} from '../src/lib/rent-split'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

const sum = (values: number[]) =>
  Number(values.reduce((total, value) => total + value, 0).toFixed(2))

console.log('rent splitting')

check('an even split is even', () => {
  assert.deepEqual(splitEqually(24000, 3), [8000, 8000, 8000])
})

check('an awkward split still adds up exactly', () => {
  const shares = splitEqually(24500, 3)
  assert.deepEqual(shares, [8166.67, 8166.67, 8166.66])
  assert.equal(sum(shares), 24500)
})

check('one hundred split three ways loses nothing', () => {
  const shares = splitEqually(100, 3)
  assert.deepEqual(shares, [33.34, 33.33, 33.33])
  assert.equal(sum(shares), 100)
})

check('a single resident pays the whole rent', () => {
  assert.deepEqual(splitEqually(22000, 1), [22000])
})

check('nobody in the flat means no shares, not a division by zero', () => {
  assert.deepEqual(splitEqually(22000, 0), [])
})

check('weighted splits follow the weights and still total exactly', () => {
  const shares = splitByWeight(30000, [2, 1])
  assert.deepEqual(shares, [20000, 10000])
  assert.equal(sum(shares), 30000)
})

check('a weighted split with a remainder gives it to the largest fraction', () => {
  const shares = splitByWeight(10000, [1, 1, 1])
  assert.equal(sum(shares), 10000)
  assert.equal(shares[0], 3333.34)
})

check('zero weights fall back to an equal split', () => {
  assert.deepEqual(splitByWeight(9000, [0, 0, 0]), [3000, 3000, 3000])
})

check('shares that add up pass the check', () => {
  const result = checkShares([14500, 10000], 24500)
  assert.equal(result.ok, true)
})

check('a shortfall is reported as a shortfall', () => {
  const result = checkShares([14500, 9000], 24500)
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.difference, -1000)
    assert.match(result.message, /short/)
  }
})

check('an excess is reported as an excess', () => {
  const result = checkShares([14500, 11000], 24500)
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.difference, 1000)
    assert.match(result.message, /over/)
  }
})

check('floating point does not creep in over many shares', () => {
  const shares = splitEqually(0.3, 3)
  assert.equal(sum(shares), 0.3)
})

check('moving out spreads the leaver’s share over the people who stay', () => {
  const after = redistribute(
    [
      { id: 'a', share: 14500 },
      { id: 'b', share: 10000 },
    ],
    24500,
  )
  assert.equal(sum(after.map((person) => person.share)), 24500)
  // The bigger payer keeps the bigger share.
  assert.ok((after[0]?.share ?? 0) > (after[1]?.share ?? 0))
})

check('the last person standing takes the whole rent', () => {
  const after = redistribute([{ id: 'a', share: 10000 }], 24500)
  assert.deepEqual(after, [{ id: 'a', share: 24500 }])
})

check('an empty flat produces no shares', () => {
  assert.deepEqual(redistribute([], 24500), [])
})

console.log(`\n${passed} checks passed`)
