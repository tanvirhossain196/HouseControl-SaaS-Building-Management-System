/**
 * Reports: ageing buckets, statement arithmetic, CSV export.
 *
 * A report that quietly adds up wrong is worse than one that fails loudly.
 * The invariant these tests defend is simple and non-negotiable: a statement
 * balances, and a CSV opens as data rather than as a program.
 *
 *   npm run test:reports
 */
import assert from 'node:assert/strict'
import {
  ageArrears,
  ageingBucket,
  buildStatement,
  collectionRate,
  csvCell,
  fillMonths,
  monthOverMonth,
  reportFilename,
  sumTaka,
  toCsv,
} from '../src/lib/reports'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

console.log('money')

check('sums do not drift the way floats do', () => {
  // 24500.50 + 10000.25 + 9000.25 in floats gives 43501.000000000004.
  assert.equal(sumTaka([24500.5, 10000.25, 9000.25]), 43501)
  assert.equal(sumTaka([0.1, 0.2]), 0.3)
  assert.equal(sumTaka([]), 0)
})

check('a month with nothing billed is fully collected, not divided by zero', () => {
  assert.equal(collectionRate(0, 0), 100)
  assert.equal(collectionRate(24500, 24500), 100)
  assert.equal(collectionRate(24500, 12250), 50)
  assert.equal(collectionRate(30000, 10000), 33)
})

console.log('\narrears ageing')

check('the bucket boundaries fall where an accountant expects', () => {
  const asOf = '2026-09-30'

  assert.equal(ageingBucket('2026-10-05', asOf), 'current', 'not yet due')
  assert.equal(ageingBucket('2026-09-30', asOf), 'current', 'due today is not late')
  assert.equal(ageingBucket('2026-09-29', asOf), '1_30')
  assert.equal(
    ageingBucket('2026-08-31', asOf),
    '1_30',
    '30 days is the last day of 1–30',
  )
  assert.equal(ageingBucket('2026-08-30', asOf), '31_60', '31 days crosses over')
  assert.equal(ageingBucket('2026-08-01', asOf), '31_60')
  assert.equal(ageingBucket('2026-07-05', asOf), '61_90', '87 days')
  assert.equal(
    ageingBucket('2026-07-02', asOf),
    '61_90',
    '90 days is the last day of 61–90',
  )
  assert.equal(ageingBucket('2026-07-01', asOf), 'over_90', '91 days crosses over')
  assert.equal(ageingBucket('2026-06-01', asOf), 'over_90')
})

check('outstanding money lands in one bucket each and the total matches', () => {
  const ageing = ageArrears(
    [
      { dueDate: '2026-10-05', outstanding: 5000 },
      { dueDate: '2026-09-20', outstanding: 12000 },
      { dueDate: '2026-08-05', outstanding: 9000 },
      { dueDate: '2026-05-05', outstanding: 3000 },
    ],
    '2026-09-30',
  )

  assert.equal(ageing.current, 5000)
  assert.equal(ageing['1_30'], 12000)
  assert.equal(ageing['31_60'], 9000)
  assert.equal(ageing.over_90, 3000)
  assert.equal(ageing.total, 29000)
})

check('settled charges are not aged', () => {
  const ageing = ageArrears(
    [
      { dueDate: '2026-08-05', outstanding: 0 },
      { dueDate: '2026-08-05', outstanding: -500 },
    ],
    '2026-09-30',
  )
  assert.equal(ageing.total, 0)
})

console.log('\nstatements')

check('a statement balances: opening + charges − payments = closing', () => {
  const statement = buildStatement(9000, [
    { date: '2026-09-05', description: 'Rent for 2026-09', charge: 24500, payment: 0 },
    { date: '2026-09-06', description: 'Payment received', charge: 0, payment: 24500 },
    { date: '2026-09-15', description: 'Gas share', charge: 1200, payment: 0 },
  ])

  assert.equal(statement.charged, 25700)
  assert.equal(statement.paid, 24500)
  assert.equal(statement.closing, 9000 + 25700 - 24500)
  assert.equal(statement.closing, 10200)
})

check('the running balance is right on every line, not just the last', () => {
  const statement = buildStatement(0, [
    { date: '2026-09-05', description: 'Rent', charge: 10000, payment: 0 },
    { date: '2026-09-10', description: 'Part payment', charge: 0, payment: 4000 },
    { date: '2026-09-20', description: 'Rest', charge: 0, payment: 6000 },
  ])

  assert.deepEqual(
    statement.lines.map((line) => line.balance),
    [10000, 6000, 0],
  )
})

check('a charge is placed before a payment made the same day', () => {
  // Otherwise the balance goes negative for a line and reads as a refund.
  const statement = buildStatement(0, [
    { date: '2026-09-05', description: 'Payment', charge: 0, payment: 24500 },
    { date: '2026-09-05', description: 'Rent', charge: 24500, payment: 0 },
  ])

  assert.equal(statement.lines[0]!.description, 'Rent')
  assert.equal(statement.lines[0]!.balance, 24500)
  assert.equal(statement.closing, 0)
})

check('awkward amounts still balance to the paisa', () => {
  const statement = buildStatement(0.1, [
    { date: '2026-09-05', description: 'A', charge: 0.2, payment: 0 },
    { date: '2026-09-06', description: 'B', charge: 33.33, payment: 0 },
    { date: '2026-09-07', description: 'C', charge: 0, payment: 33.63 },
  ])

  assert.equal(statement.closing, 0)
})

check('an empty statement carries its opening balance through', () => {
  const statement = buildStatement(5000, [])
  assert.equal(statement.closing, 5000)
  assert.equal(statement.lines.length, 0)
})

console.log('\nCSV export')

check('commas, quotes and newlines do not shift the columns', () => {
  assert.equal(csvCell('Road 7, House 22'), '"Road 7, House 22"')
  assert.equal(csvCell('He said "paid"'), '"He said ""paid"""')
  assert.equal(csvCell('line one\nline two'), '"line one\nline two"')
  assert.equal(csvCell('plain'), 'plain')
  assert.equal(csvCell(null), '')
  assert.equal(csvCell(24500), '24500')
})

check('a cell that looks like a formula is neutralised', () => {
  // A resident named =cmd|'/c calc'!A1 must not run anything when the owner
  // opens the export in Excel.
  assert.equal(csvCell("=cmd|'/c calc'!A1"), "'=cmd|'/c calc'!A1")
  assert.equal(csvCell('+1234567890'), "'+1234567890")
  assert.equal(csvCell('-1+1'), "'-1+1")
  assert.equal(csvCell('@SUM(A1:A9)'), "'@SUM(A1:A9)")
})

check('a negative number is still readable as a number', () => {
  // It is escaped as text, which is the safe trade: a wrong sign in a cell is
  // visible, a formula running is not.
  assert.ok(csvCell(-500).startsWith("'"))
})

check('the file starts with a BOM so Excel reads Bangla', () => {
  const csv = toCsv(['Name', 'Amount'], [['শিরিন আক্তার', 24500]])
  assert.ok(csv.startsWith('\uFEFF'), 'no BOM means mojibake on Windows')
  assert.ok(csv.includes('শিরিন আক্তার'))
})

check('rows are CRLF-terminated, as the format expects', () => {
  const csv = toCsv(
    ['A', 'B'],
    [
      [1, 2],
      [3, 4],
    ],
  )
  const lines = csv.replace('\uFEFF', '').trimEnd().split('\r\n')

  assert.deepEqual(lines, ['A,B', '1,2', '3,4'])
})

check('filenames sort by date and survive any filesystem', () => {
  assert.equal(
    reportFilename('ledger', 'Nasreen Tower', '2026-09'),
    'housecontrol-ledger-nasreen-tower-2026-09.csv',
  )
  assert.equal(
    reportFilename('ledger', 'Road 7 / House #22', '2026-09'),
    'housecontrol-ledger-road-7-house-22-2026-09.csv',
  )
  assert.equal(
    reportFilename('ledger', '', '2026-09'),
    'housecontrol-ledger-all-2026-09.csv',
  )
})

console.log('\ntrends')

check('a month with no billing appears as zero, not as a gap', () => {
  const filled = fillMonths(
    [
      { period: '2026-07-01', billed: 24500, collected: 24500 },
      { period: '2026-09-01', billed: 24500, collected: 12000 },
    ],
    '2026-07',
    '2026-09',
  )

  assert.equal(filled.length, 3)
  assert.equal(filled[1]!.period, '2026-08-01')
  assert.equal(
    filled[1]!.billed,
    0,
    'August was never billed, and the chart should say so',
  )
})

check('the series crosses a year boundary', () => {
  const filled = fillMonths([], '2025-11', '2026-02')
  assert.deepEqual(
    filled.map((point) => point.period),
    ['2025-11-01', '2025-12-01', '2026-01-01', '2026-02-01'],
  )
})

check('growth from nothing is undefined rather than infinite', () => {
  assert.equal(monthOverMonth(24500, 20000), 23)
  assert.equal(monthOverMonth(20000, 24500), -18)
  assert.equal(monthOverMonth(24500, 0), null, 'not a 2450000% rise')
  assert.equal(monthOverMonth(0, 0), 0)
})

console.log(`\n${passed} checks passed`)
