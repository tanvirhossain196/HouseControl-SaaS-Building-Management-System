/**
 * Unit-numbering tests.
 *
 * The bulk generator has to produce the labels an owner already writes on the
 * rent register. These cases are the ones that would silently produce a
 * building full of wrongly named flats.
 *
 *   npm run test:units
 */
import assert from 'node:assert/strict'
import {
  findCollisions,
  floorLabel,
  planUnits,
  unitNumber,
  type BulkPlan,
} from '../src/lib/units'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

const base: BulkPlan = {
  fromFloor: 0,
  toFloor: 3,
  unitsPerFloor: 2,
  floorStyle: 'ground_g',
  unitStyle: 'floor_letter',
}

console.log('unit numbering')

check('the ground floor is G, basements are B1 and B2', () => {
  assert.equal(floorLabel(0, 'ground_g'), 'G')
  assert.equal(floorLabel(3, 'ground_g'), '3')
  assert.equal(floorLabel(-1, 'ground_g'), 'B1')
  assert.equal(floorLabel(-2, 'ground_g'), 'B2')
})

check('other floor conventions are respected', () => {
  assert.equal(floorLabel(0, 'ground_zero'), '0')
  assert.equal(floorLabel(0, 'ground_one'), '1')
  assert.equal(floorLabel(3, 'ground_one'), '4')
})

check('floor+letter numbering reads 3A, 3B', () => {
  assert.equal(unitNumber(3, 0, base), '3A')
  assert.equal(unitNumber(3, 1, base), '3B')
  assert.equal(unitNumber(0, 0, base), 'GA')
})

check('floor+index numbering reads 301, 302 and G01 on the ground', () => {
  const plan: BulkPlan = { ...base, unitStyle: 'floor_index' }
  assert.equal(unitNumber(3, 0, plan), '301')
  assert.equal(unitNumber(3, 1, plan), '302')
  assert.equal(unitNumber(0, 0, plan), 'G01')
})

check('units are generated top floor first', () => {
  const units = planUnits(base)
  assert.equal(units.length, 8)
  assert.equal(units[0]!.unitNumber, '3A')
  assert.equal(units[units.length - 1]!.unitNumber, 'GB')
})

check('skipped floors are left out — shops on the ground floor', () => {
  const units = planUnits({ ...base, skipFloors: [0] })
  assert.equal(units.length, 6)
  assert.ok(!units.some((unit) => unit.floor === 0))
})

check('basements are included when the range goes below zero', () => {
  const units = planUnits({ ...base, fromFloor: -1, unitsPerFloor: 1 })
  assert.equal(units.at(-1)!.unitNumber, 'B1A')
})

check('a single floor produces one row of units', () => {
  const units = planUnits({ ...base, fromFloor: 2, toFloor: 2 })
  assert.deepEqual(
    units.map((u) => u.unitNumber),
    ['2A', '2B'],
  )
})

check('an inverted range produces nothing rather than throwing', () => {
  assert.deepEqual(planUnits({ ...base, fromFloor: 5, toFloor: 2 }), [])
})

check('existing units are detected case-insensitively', () => {
  const collisions = findCollisions(planUnits(base), ['3a', '2B'])
  assert.deepEqual(collisions, ['3A', '2B'])
})

check('more than 26 units on a floor falls back to numbers', () => {
  const plan: BulkPlan = { ...base, unitsPerFloor: 27, fromFloor: 1, toFloor: 1 }
  const units = planUnits(plan)
  assert.equal(units[25]!.unitNumber, '1Z')
  assert.equal(units[26]!.unitNumber, '127')
})

console.log(`\n${passed} checks passed`)
