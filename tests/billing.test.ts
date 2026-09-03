/**
 * Billing arithmetic: periods, due dates, receipt numbers.
 *
 * These are the cases that produce a wrong ledger quietly rather than loudly —
 * a rent day of 31 in February, a period that shifts because the server is in
 * UTC, a receipt number that repeats next January.
 *
 *   npm run test:billing
 */
import assert from 'node:assert/strict'
import {
  daysInPeriod,
  dueDateFor,
  nextPeriod,
  parseReceiptNumber,
  periodLabel,
  periodOf,
  previousPeriod,
  receiptNumber,
  summarise,
  todayInDhaka,
} from '../src/lib/billing'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

console.log('billing arithmetic')

check('the day is Dhaka’s day, not the server’s', () => {
  // 20:30 UTC on the 2nd is already the 3rd in Dhaka (UTC+6).
  assert.equal(todayInDhaka(new Date('2026-09-02T20:30:00Z')), '2026-09-03')
  assert.equal(todayInDhaka(new Date('2026-09-02T17:00:00Z')), '2026-09-02')
})

check('a date belongs to the first of its month', () => {
  assert.equal(periodOf('2026-09-17'), '2026-09-01')
  assert.equal(periodOf(new Date('2026-01-31T23:00:00Z')), '2026-02-01')
})

check('periods step across the year boundary', () => {
  assert.equal(previousPeriod('2026-01-01'), '2025-12-01')
  assert.equal(nextPeriod('2026-12-01'), '2027-01-01')
  assert.equal(previousPeriod('2026-09-01'), '2026-08-01')
})

check('month lengths include leap years', () => {
  assert.equal(daysInPeriod('2026-02-01'), 28)
  assert.equal(daysInPeriod('2028-02-01'), 29)
  assert.equal(daysInPeriod('2026-09-01'), 30)
  assert.equal(daysInPeriod('2026-12-01'), 31)
})

check('a rent day of 31 bills on the last day of February, not in March', () => {
  assert.equal(dueDateFor('2026-02-01', 31), '2026-02-28')
  assert.equal(dueDateFor('2028-02-01', 31), '2028-02-29')
  assert.equal(dueDateFor('2026-09-01', 31), '2026-09-30')
})

check('an ordinary rent day is used as written', () => {
  assert.equal(dueDateFor('2026-09-01', 5), '2026-09-05')
  assert.equal(dueDateFor('2026-11-01', 28), '2026-11-28')
})

check('a rent day of zero or negative falls back to the first', () => {
  assert.equal(dueDateFor('2026-09-01', 0), '2026-09-01')
  assert.equal(dueDateFor('2026-09-01', -4), '2026-09-01')
})

check('receipt numbers carry the month and pad the sequence', () => {
  assert.equal(receiptNumber('2026-09-01', 1), 'HC-2609-0001')
  assert.equal(receiptNumber('2026-09-01', 42), 'HC-2609-0042')
  assert.equal(receiptNumber('2026-12-01', 7), 'HC-2612-0007')
})

check('the same sequence in a different month is a different receipt', () => {
  assert.notEqual(receiptNumber('2026-01-01', 1), receiptNumber('2027-01-01', 1))
})

check('receipt numbers read back to the month they were issued in', () => {
  assert.deepEqual(parseReceiptNumber('HC-2609-0042'), {
    period: '2026-09-01',
    sequence: 42,
  })
  assert.equal(parseReceiptNumber('HC-2613-0001'), null, 'month 13 is not a month')
  assert.equal(parseReceiptNumber('nonsense'), null)
})

check('month labels are spelled out for receipts', () => {
  assert.equal(periodLabel('2026-09-01'), 'September 2026')
})

check('older unpaid charges are carried, not rewritten', () => {
  const dues = [
    { amount: 14500, amountPaid: 14500, dueDate: '2026-09-05', status: 'paid' },
    { amount: 10000, amountPaid: 4000, dueDate: '2026-09-05', status: 'partially_paid' },
    { amount: 9000, amountPaid: 0, dueDate: '2026-08-05', status: 'open' },
  ]

  const summary = summarise(dues, '2026-09-01', '2026-09-10')

  assert.equal(summary.billed, 24500, 'this month’s billing excludes August')
  assert.equal(summary.collected, 18500)
  assert.equal(summary.outstanding, 15000, 'everything still owed, from any month')
  assert.equal(summary.broughtForward, 9000, 'August’s unpaid balance')
  assert.equal(summary.overdueCount, 2)
})

console.log(`\n${passed} checks passed`)
