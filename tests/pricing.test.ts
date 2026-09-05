/**
 * Plan pricing and the WhatsApp handoff.
 *
 * A price is shown on the marketing page, again on the upgrade screen, and
 * again in the message that goes to WhatsApp. All three come from `quote()`,
 * and these checks are what keep them the same number.
 *
 *   npm run test:pricing
 */
import assert from 'node:assert/strict'
import { limitsFor, PERIODS, PLANS, planById, quote, taka } from '../src/lib/pricing'
import { purchaseLink, purchaseMessage, whatsappLink } from '../src/lib/whatsapp'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

console.log('plans')

check('three tiers, priced as advertised', () => {
  assert.deepEqual(
    PLANS.map((plan) => [plan.id, plan.monthly]),
    [
      ['free', 0],
      ['plus', 500],
      ['pro', 1000],
    ],
  )
})

check('every paid tier says what it does not include', () => {
  // A plan page that only lists what you get makes people guess at the rest.
  assert.ok(PLANS.find((plan) => plan.id === 'free')!.missing.length > 0)
  assert.ok(PLANS.find((plan) => plan.id === 'plus')!.missing.length > 0)
  assert.equal(
    PLANS.find((plan) => plan.id === 'pro')!.missing.length,
    0,
    'Pro has everything',
  )
})

check('every tier is written in both languages', () => {
  for (const plan of PLANS) {
    assert.ok(plan.nameBn.length > 0, `${plan.id} has no Bangla name`)
    assert.equal(
      plan.features.length,
      plan.featuresBn.length,
      `${plan.id} has a different number of features in each language`,
    )
  }
})

console.log('\ndiscounts')

check('monthly has no discount', () => {
  const priced = quote('plus', 1)
  assert.equal(priced.total, 500)
  assert.equal(priced.saved, 0)
  assert.equal(priced.effectiveMonthly, 500)
})

check('longer commitments cost less per month', () => {
  const monthly = quote('plus', 1).effectiveMonthly
  const quarterly = quote('plus', 3).effectiveMonthly
  const half = quote('plus', 6).effectiveMonthly
  const yearly = quote('plus', 12).effectiveMonthly

  assert.ok(monthly > quarterly, 'three months should beat monthly')
  assert.ok(quarterly > half, 'six months should beat three')
  assert.ok(half > yearly, 'a year should beat six months')
})

check('a year of Plus is 20% off, to the taka', () => {
  const priced = quote('plus', 12)
  assert.equal(priced.listPrice, 6000)
  assert.equal(priced.total, 4800)
  assert.equal(priced.saved, 1200)
  assert.equal(priced.effectiveMonthly, 400)
})

check('a year of Pro is 20% off too', () => {
  const priced = quote('pro', 12)
  assert.equal(priced.listPrice, 12_000)
  assert.equal(priced.total, 9600)
  assert.equal(priced.saved, 2400)
})

check('the free plan stays free however long you commit', () => {
  for (const period of PERIODS) {
    const priced = quote('free', period.months)
    assert.equal(priced.total, 0, `free cost money for ${period.months} months`)
    assert.equal(priced.saved, 0)
  }
})

check('totals and savings always reconcile', () => {
  for (const plan of PLANS) {
    for (const period of PERIODS) {
      const priced = quote(plan.id, period.months)
      assert.equal(
        priced.total + priced.saved,
        priced.listPrice,
        `${plan.id}/${period.months} does not add up`,
      )
    }
  }
})

check('no discount goes past a fifth', () => {
  // Beyond that the monthly price stops looking real.
  for (const period of PERIODS) {
    assert.ok(
      period.discount <= 20,
      `${period.months} months discounts ${period.discount}%`,
    )
  }
})

check('an unknown plan or period falls back rather than throwing', () => {
  const priced = quote('nonsense' as never, 99)
  assert.equal(priced.planId, 'free')
  assert.equal(priced.months, 1)
})

check('prices are formatted the way they are written on a receipt', () => {
  assert.equal(taka(4800), '৳4,800')
  assert.equal(taka(500), '৳500')
  assert.equal(taka(0), '৳0')
})

check('plan limits match what the page promises', () => {
  assert.deepEqual(limitsFor('free'), { buildings: 1, units: 2 })
  assert.deepEqual(limitsFor('plus'), { buildings: 1, units: 40 })
  assert.ok(limitsFor('pro').units > 1000)
  assert.equal(planById('nope'), null)
})

console.log('\nwhatsapp handoff')

check('the message carries the figure the screen showed', () => {
  const message = purchaseMessage({
    planId: 'plus',
    planName: 'Plus',
    months: 6,
    periodLabel: '6 months',
    organisation: 'Karim Properties',
    name: 'Md Tanvir Hossain',
    email: 'owner@example.com',
    phone: '01712345678',
  })

  assert.ok(message.includes('৳2,700'), `total missing from: ${message}`)
  assert.ok(message.includes('Plus'))
  assert.ok(message.includes('6 months'))
  assert.ok(message.includes('Karim Properties'))
  assert.ok(message.includes('10%'), 'the discount should be stated')
})

check('missing details are left out rather than sent as blanks', () => {
  const message = purchaseMessage({
    planId: 'pro',
    planName: 'Pro',
    months: 1,
    periodLabel: 'Monthly',
  })

  assert.ok(!message.includes('undefined'))
  assert.ok(!message.includes('null'))
  assert.ok(!/Email:\s*$/m.test(message))
})

check('an ampersand in a building name does not truncate the message', () => {
  // A raw template string would end the message at the &.
  const link = purchaseLink({
    planId: 'plus',
    planName: 'Plus',
    months: 3,
    periodLabel: '3 months',
    organisation: 'A&B Properties',
  })

  assert.ok(!link.includes('A&B'), 'the ampersand should be encoded')
  assert.ok(link.includes('A%26B'))
  assert.ok(decodeURIComponent(link.split('text=')[1]!).includes('A&B Properties'))
})

check('the link points at the support number', () => {
  const link = whatsappLink('hello')
  assert.ok(link.startsWith('https://wa.me/8801616122600?text='))
})

console.log(`\n${passed} checks passed`)
