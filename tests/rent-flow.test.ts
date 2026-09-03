/**
 * Rent-split behaviour across a flat's life: someone joins, someone leaves,
 * the rent changes. These compose the primitives in rent-split.ts the way the
 * services do, and check the property that actually matters — the shares add
 * up to the flat rent, at every step.
 *
 *   npx tsx tests/rent-flow.test.ts
 */
import assert from 'node:assert/strict'
import {
  checkShares,
  redistribute,
  splitEqually,
  splitByWeight,
} from '../src/lib/rent-split'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

const sum = (values: number[]) => Number(values.reduce((a, b) => a + b, 0).toFixed(2))

console.log('rent split over a flat’s life')

check('a third person moving in re-splits without losing a taka', () => {
  const rent = 24500
  const two = splitEqually(rent, 2)
  assert.equal(sum(two), rent)

  const three = splitEqually(rent, 3)
  assert.equal(sum(three), rent)
  assert.ok(checkShares(three, rent).ok)
})

check('when one person leaves, the others absorb their share in proportion', () => {
  const rent = 24500
  const before = [
    { id: 'a', share: 14500 },
    { id: 'b', share: 6000 },
    { id: 'c', share: 4000 },
  ]
  assert.equal(sum(before.map((p) => p.share)), rent)

  const after = redistribute(
    before.filter((person) => person.id !== 'c'),
    rent,
  )

  assert.equal(sum(after.map((p) => p.share)), rent)
  // A was paying more than B, and still is.
  assert.ok(after[0]!.share > after[1]!.share)
})

check('raising the rent keeps every share proportional and exact', () => {
  const current = [
    { id: 'a', share: 14500 },
    { id: 'b', share: 10000 },
  ]
  const raised = redistribute(current, 27000)
  assert.equal(sum(raised.map((p) => p.share)), 27000)
  assert.ok(raised[0]!.share > raised[1]!.share)
})

check('a flat split by floor area totals the rent exactly', () => {
  const shares = splitByWeight(24500, [700, 450, 350])
  assert.equal(sum(shares), 24500)
})

check('the awkward cases still balance', () => {
  for (const rent of [1, 100, 999.99, 24500, 33333.33]) {
    for (const people of [1, 2, 3, 6, 7, 11]) {
      const shares = splitEqually(rent, people)
      assert.equal(
        sum(shares),
        Number(rent.toFixed(2)),
        `${rent} between ${people} did not add up`,
      )
    }
  }
})

check('a shortfall and an excess are both named, with the amount', () => {
  const short = checkShares([10000, 10000], 24500)
  assert.equal(short.ok, false)
  assert.ok(!short.ok && short.difference < 0)

  const over = checkShares([20000, 10000], 24500)
  assert.equal(over.ok, false)
  assert.ok(!over.ok && over.difference > 0)
})

console.log(`\n${passed} checks passed`)
