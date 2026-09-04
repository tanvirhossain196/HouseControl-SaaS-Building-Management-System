/**
 * Reports: arrears ageing, statements, and CSV export.
 *
 * All of it is pure, because a report that quietly adds up wrong is worse
 * than one that fails loudly, and the only way to know it adds up is to check
 * the arithmetic without a database in the way.
 *
 * `npm run test:reports` covers it.
 */

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/**
 * Amounts are summed in paisa and converted back once.
 *
 * Adding 24500.50 + 10000.25 + 9000.25 in floats leaves 43501.000000000004,
 * which then prints as 43,501.00 in one place and 43,501.0000001 in another.
 * Integers do not do that.
 */
export function sumTaka(amounts: number[]): number {
  const paisa = amounts.reduce((total, amount) => total + Math.round(amount * 100), 0)
  return paisa / 100
}

/** Collection rate as a whole percentage. Nothing billed means nothing owed. */
export function collectionRate(billed: number, collected: number): number {
  if (billed <= 0) return 100
  return Math.round((collected / billed) * 100)
}

// ---------------------------------------------------------------------------
// Arrears ageing
// ---------------------------------------------------------------------------

export type AgeingBucket = 'current' | '1_30' | '31_60' | '61_90' | 'over_90'

export const AGEING_LABELS: Record<AgeingBucket, string> = {
  current: 'Not yet due',
  '1_30': '1–30 days',
  '31_60': '31–60 days',
  '61_90': '61–90 days',
  over_90: 'Over 90 days',
}

/**
 * How late a charge is, in the buckets an accountant expects.
 *
 * The boundaries are inclusive at the top: 30 days late is in 1–30, 31 is in
 * 31–60. Getting that wrong shifts money between columns in a way nobody
 * notices until the totals are questioned.
 */
export function ageingBucket(dueDate: string, asOf: string): AgeingBucket {
  const days = Math.round(
    (Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) / 86_400_000,
  )

  if (Number.isNaN(days) || days <= 0) return 'current'
  if (days <= 30) return '1_30'
  if (days <= 60) return '31_60'
  if (days <= 90) return '61_90'
  return 'over_90'
}

export type AgeableCharge = { dueDate: string; outstanding: number }

export type Ageing = Record<AgeingBucket, number> & { total: number }

/** Outstanding money, split by how long it has been outstanding. */
export function ageArrears(charges: AgeableCharge[], asOf: string): Ageing {
  const buckets: Record<AgeingBucket, number[]> = {
    current: [],
    '1_30': [],
    '31_60': [],
    '61_90': [],
    over_90: [],
  }

  for (const charge of charges) {
    if (charge.outstanding <= 0) continue
    buckets[ageingBucket(charge.dueDate, asOf)].push(charge.outstanding)
  }

  const totals = {
    current: sumTaka(buckets.current),
    '1_30': sumTaka(buckets['1_30']),
    '31_60': sumTaka(buckets['31_60']),
    '61_90': sumTaka(buckets['61_90']),
    over_90: sumTaka(buckets.over_90),
  }

  return { ...totals, total: sumTaka(Object.values(totals)) }
}

// ---------------------------------------------------------------------------
// Statements
// ---------------------------------------------------------------------------

export type StatementLine = {
  date: string
  description: string
  /** What was billed on this line. */
  charge: number
  /** What was paid on this line. */
  payment: number
  reference?: string | null
}

export type Statement = {
  opening: number
  lines: (StatementLine & { balance: number })[]
  charged: number
  paid: number
  closing: number
}

/**
 * A running statement, the way a bank prints one.
 *
 * The invariant that matters: opening + charges − payments = closing, exactly,
 * on every line and at the bottom. If a statement does not balance, nobody
 * trusts anything else in the app.
 *
 * Lines are sorted by date, and a charge is placed before a payment on the
 * same day — you cannot pay something that has not been billed yet.
 */
export function buildStatement(opening: number, lines: StatementLine[]): Statement {
  const ordered = [...lines].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1
    // Charges first on a shared date.
    return b.charge - a.charge
  })

  let balance = Math.round(opening * 100)
  const withBalance = ordered.map((line) => {
    balance += Math.round(line.charge * 100) - Math.round(line.payment * 100)
    return { ...line, balance: balance / 100 }
  })

  return {
    opening,
    lines: withBalance,
    charged: sumTaka(ordered.map((line) => line.charge)),
    paid: sumTaka(ordered.map((line) => line.payment)),
    closing: balance / 100,
  }
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/**
 * Escapes one cell.
 *
 * Two separate problems, both solved here:
 *
 *   - Commas, quotes and newlines have to be quoted, or the columns shift.
 *   - A cell starting with =, +, - or @ is executed as a formula when the
 *     file is opened in Excel or Sheets. A resident whose name is typed as
 *     `=cmd|'/c calc'!A1` should not be able to run anything on the owner's
 *     machine, so those cells get a leading apostrophe.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''

  let text = String(value)

  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`
  }

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }

  return text
}

/**
 * A CSV with a UTF-8 BOM.
 *
 * Excel on Windows reads a BOM-less UTF-8 file as Windows-1252, which turns
 * every Bangla name into mojibake. One three-byte prefix avoids a support
 * conversation that otherwise happens every time.
 */
export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const lines = [
    headers.map(csvCell).join(','),
    ...rows.map((row) => row.map(csvCell).join(',')),
  ]
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

/** A filename that sorts by date and survives every filesystem. */
export function reportFilename(kind: string, scope: string, period: string): string {
  const safe = scope
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)

  return `housecontrol-${kind}-${safe || 'all'}-${period}.csv`
}

// ---------------------------------------------------------------------------
// Trends
// ---------------------------------------------------------------------------

export type MonthlyPoint = { period: string; billed: number; collected: number }

/**
 * Fills the gaps in a series of months.
 *
 * A month with no billing is a real data point — it means nobody was billed,
 * which is usually a mistake worth seeing. Leaving it out of the chart makes
 * the line jump from July to September as though August did not happen.
 */
export function fillMonths(
  points: MonthlyPoint[],
  from: string,
  to: string,
): MonthlyPoint[] {
  const known = new Map(points.map((point) => [point.period, point]))
  const filled: MonthlyPoint[] = []

  let [year, month] = from.split('-').map(Number)
  const [endYear, endMonth] = to.split('-').map(Number)
  if (!year || !month || !endYear || !endMonth) return points

  while (year < endYear || (year === endYear && month <= endMonth)) {
    const period = `${year}-${String(month).padStart(2, '0')}-01`
    filled.push(known.get(period) ?? { period, billed: 0, collected: 0 })

    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }

  return filled
}

/** Change against the previous month, as a percentage. */
export function monthOverMonth(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null
  return Math.round(((current - previous) / previous) * 100)
}
