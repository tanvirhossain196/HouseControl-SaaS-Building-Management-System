/**
 * Schemas against what forms actually post.
 *
 * Every value from an `<input>` is a string, including numbers. A schema that
 * expects `number` rejects the form's own output, and the person sees "some
 * fields need fixing" with nothing marked — which is exactly what happened to
 * the Generate units dialog.
 *
 * These parse form-shaped objects: strings everywhere, as `FormData` gives
 * them.
 *
 *   npm run test:forms
 */
import assert from 'node:assert/strict'
import {
  bulkFlatsSchema,
  createBuildingSchema,
  createFlatSchema,
  landlordRentSchema,
  updateFlatSchema,
} from '../src/lib/validation/property'
import { createExpenseSchema, submitPaymentSchema } from '../src/lib/validation/money'
import { money } from '../src/lib/validation/common'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

const BUILDING = 'bbbbbbbb-0000-4000-8000-000000000001'
const FLAT = 'cccccccc-0000-4000-8000-000000000051'
const ORG = 'aaaaaaaa-0000-4000-8000-000000000001'
const USER = '22222222-2222-4222-8222-222222222222'

/** Parses and reports which field failed, so a failure names itself. */
function accepts(schema: { safeParse: (value: unknown) => { success: boolean; error?: { issues: { path: (string | number)[]; message: string }[] } } }, input: unknown, what: string) {
  const result = schema.safeParse(input)
  if (!result.success) {
    const detail = result.error!.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ')
    assert.fail(`${what} was rejected — ${detail}`)
  }
}

console.log('amounts')

check('a number typed into a field is accepted', () => {
  assert.equal(money.parse('37000'), 37000)
  assert.equal(money.parse('24500.50'), 24500.5)
  assert.equal(money.parse(24500), 24500)
})

check('an empty field means zero, not an error', () => {
  assert.equal(money.parse(''), 0)
})

check('letters are still refused', () => {
  assert.equal(money.safeParse('abc').success, false)
  assert.equal(money.safeParse('-500').success, false, 'negative rent')
  assert.equal(money.safeParse('999999999').success, false, 'implausible amount')
})

console.log('\nforms post strings')

check('Generate units', () => {
  accepts(
    bulkFlatsSchema,
    {
      buildingId: BUILDING,
      fromFloor: '0',
      toFloor: '9',
      unitsPerFloor: '2',
      floorStyle: 'ground_g',
      unitStyle: 'floor_letter',
      skipFloors: [],
      monthlyRent: '37000',
      rentDueDay: '10',
    },
    'the Generate units dialog',
  )
})

check('Add flat', () => {
  accepts(
    createFlatSchema,
    {
      buildingId: BUILDING,
      unitNumber: '5B',
      floor: '5',
      monthlyRent: '24500',
      landlordRent: '0',
      rentDueDay: '5',
      occupancyStatus: 'vacant',
    },
    'the Add flat form',
  )
})

check('Edit flat, with the optional fields left blank', () => {
  accepts(
    updateFlatSchema,
    { unitNumber: '5B', monthlyRent: '24500', landlordRent: '' },
    'the Edit flat form',
  )
})

check('Add building', () => {
  accepts(
    createBuildingSchema,
    {
      orgId: ORG,
      name: 'Nasreen Tower',
      addressLine: 'Road 7, House 22',
      area: 'Mirpur DOHS',
      city: 'Dhaka',
      floorsCount: '6',
      amenities: ['lift', 'generator'],
    },
    'the Add building form',
  )
})

check('Record a payment', () => {
  accepts(
    submitPaymentSchema,
    {
      flatId: FLAT,
      amount: '14500',
      method: 'bkash',
      paidAt: '2026-09-05',
      reference: '8N7A2C4D1E',
    },
    'the payment form',
  )
})

check('Add an expense', () => {
  accepts(
    createExpenseSchema,
    {
      buildingId: BUILDING,
      scope: 'building',
      category: 'gas',
      title: 'Titas gas — September',
      amount: '3600',
      period: '2026-09-01',
      splitMethod: 'equal',
    },
    'the expense form',
  )
})

check('Landlord rent', () => {
  accepts(
    landlordRentSchema,
    { flatId: FLAT, period: '2026-09-01', amount: '18000', paidAt: '2026-09-03' },
    'the landlord rent form',
  )
})

console.log('\nbad input is still caught')

check('a rent day past 28 is refused', () => {
  const result = bulkFlatsSchema.safeParse({
    buildingId: BUILDING,
    fromFloor: '0',
    toFloor: '5',
    unitsPerFloor: '2',
    floorStyle: 'ground_g',
    unitStyle: 'floor_letter',
    skipFloors: [],
    monthlyRent: '20000',
    rentDueDay: '31',
  })

  assert.equal(result.success, false)
})

check('an inverted floor range is refused', () => {
  const result = bulkFlatsSchema.safeParse({
    buildingId: BUILDING,
    fromFloor: '9',
    toFloor: '2',
    unitsPerFloor: '2',
    floorStyle: 'ground_g',
    unitStyle: 'floor_letter',
    skipFloors: [],
    monthlyRent: '20000',
    rentDueDay: '5',
  })

  assert.equal(result.success, false)
})

check('a payment of nothing is refused', () => {
  const result = submitPaymentSchema.safeParse({
    flatId: FLAT,
    amount: '0',
    method: 'cash',
    paidAt: '2026-09-05',
  })

  assert.equal(result.success, false)
})

check('a made-up id is refused', () => {
  assert.equal(
    createFlatSchema.safeParse({
      buildingId: 'not-a-uuid',
      unitNumber: '5B',
      floor: '5',
      monthlyRent: '1000',
    }).success,
    false,
  )
  void USER
})

console.log(`\n${passed} checks passed`)
