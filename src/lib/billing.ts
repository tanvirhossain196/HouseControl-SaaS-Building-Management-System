/**
 * Billing arithmetic.
 *
 * Dates and receipt numbers get their own file because they are the part of
 * the ledger that is easy to get subtly wrong and expensive to fix afterwards:
 * a rent day of 31 in February, a period that shifts by a day because the
 * server runs in UTC and the building is in Dhaka, a receipt number that
 * repeats in January of the next year.
 *
 * Pure, checked by `npm run test:billing`.
 */

/** Dhaka is UTC+6 with no daylight saving. */
const DHAKA_OFFSET_MINUTES = 6 * 60

/** Today's date as it reads in Dhaka, not wherever the server happens to be. */
export function todayInDhaka(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + DHAKA_OFFSET_MINUTES * 60_000)
  return shifted.toISOString().slice(0, 10)
}

/** The month a date belongs to, as the first of that month: "2026-09-01". */
export function periodOf(date: string | Date = new Date()): string {
  const iso = typeof date === 'string' ? date : todayInDhaka(date)
  return `${iso.slice(0, 7)}-01`
}

/** The period before this one, crossing the year boundary correctly. */
export function previousPeriod(period: string): string {
  const [year, month] = period.split('-').map(Number)
  if (!year || !month) return period
  return month === 1
    ? `${year - 1}-12-01`
    : `${year}-${String(month - 1).padStart(2, '0')}-01`
}

export function nextPeriod(period: string): string {
  const [year, month] = period.split('-').map(Number)
  if (!year || !month) return period
  return month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, '0')}-01`
}

/** How many days the period's month has. */
export function daysInPeriod(period: string): number {
  const [year, month] = period.split('-').map(Number)
  if (!year || !month) return 30
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * The date rent is due in a given month.
 *
 * `rent_due_day` is capped at 28 in the schema so every month has one, but
 * this clamps anyway — a flat imported with day 31 should bill on the last of
 * February rather than silently roll into March.
 */
export function dueDateFor(period: string, rentDueDay: number): string {
  const [year, month] = period.split('-').map(Number)
  if (!year || !month) return period

  const day = Math.min(Math.max(1, Math.round(rentDueDay)), daysInPeriod(period))
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Negative means overdue. Both dates are plain YYYY-MM-DD, compared as such. */
export function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  if (Number.isNaN(start) || Number.isNaN(end)) return 0
  return Math.round((end - start) / 86_400_000)
}

/**
 * Human month label: "September 2026". Used on receipts and statements, so it
 * is spelled out rather than left as 2026-09.
 */
export function periodLabel(period: string): string {
  const [year, month] = period.split('-').map(Number)
  if (!year || !month) return period
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * Receipt numbers: HC-2609-0001.
 *
 * The month is part of the number, so the sequence restarts each month and
 * cannot collide with last year's. Four digits covers 9,999 confirmed
 * payments in one building in one month, which no building will reach.
 */
export function receiptNumber(period: string, sequence: number): string {
  const [year, month] = period.split('-')
  const yy = (year ?? '').slice(2)
  const mm = month ?? '00'
  return `HC-${yy}${mm}-${String(Math.max(1, sequence)).padStart(4, '0')}`
}

/** Reads a receipt number back, for lookups and imports. */
export function parseReceiptNumber(
  receipt: string,
): { period: string; sequence: number } | null {
  const match = /^HC-(\d{2})(\d{2})-(\d{4})$/.exec(receipt.trim().toUpperCase())
  if (!match) return null

  const [, yy, mm, seq] = match
  const month = Number(mm)
  if (month < 1 || month > 12) return null

  return { period: `20${yy}-${mm}-01`, sequence: Number(seq) }
}

export type DueLike = {
  amount: number
  amountPaid: number
  dueDate: string
  status: string
}

/** What is still owed on a due. */
export function outstandingOf(due: DueLike): number {
  return Math.max(0, Number(due.amount) - Number(due.amountPaid))
}

/**
 * A flat's position at a moment: what was billed this month, what has been
 * paid against it, and what is still open from any month.
 *
 * Older unpaid dues are not rewritten into the new month — they stay on the
 * month they belong to and keep showing until they are settled. That is what
 * "carried forward" means here, and it keeps a receipt honest about which
 * month it paid for.
 */
export function summarise(dues: DueLike[], period: string, today: string) {
  const thisMonth = dues.filter((due) => due.dueDate.startsWith(period.slice(0, 7)))

  return {
    billed: thisMonth.reduce((sum, due) => sum + Number(due.amount), 0),
    collected: thisMonth.reduce((sum, due) => sum + Number(due.amountPaid), 0),
    outstanding: dues.reduce((sum, due) => sum + outstandingOf(due), 0),
    broughtForward: dues
      .filter((due) => !due.dueDate.startsWith(period.slice(0, 7)))
      .reduce((sum, due) => sum + outstandingOf(due), 0),
    overdueCount: dues.filter((due) => outstandingOf(due) > 0 && due.dueDate < today)
      .length,
  }
}
