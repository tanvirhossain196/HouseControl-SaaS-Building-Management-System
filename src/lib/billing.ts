/**
 * Billing arithmetic.
 *
 * All date, due, payment and receipt calculations stay here so every screen
 * uses the same billing rules.
 */

/** Dhaka is UTC+6 with no daylight saving time. */
const DHAKA_OFFSET_MINUTES = 6 * 60
const DAY_MS = 86_400_000

/** Returns today's date according to Bangladesh time. */
export function todayInDhaka(
  now: Date = new Date(),
): string {
  const shifted = new Date(
    now.getTime() + DHAKA_OFFSET_MINUTES * 60_000,
  )

  return shifted.toISOString().slice(0, 10)
}

/** Converts a date into the first day of its billing month. */
export function periodOf(
  date: string | Date = new Date(),
): string {
  const iso =
    typeof date === 'string'
      ? date
      : todayInDhaka(date)

  return `${iso.slice(0, 7)}-01`
}

/** Returns the previous billing period. */
export function previousPeriod(
  period: string,
): string {
  const [year, month] = period.split('-').map(Number)

  if (!year || !month) {
    return period
  }

  return month === 1
    ? `${year - 1}-12-01`
    : `${year}-${String(month - 1).padStart(2, '0')}-01`
}

/** Returns the next billing period. */
export function nextPeriod(
  period: string,
): string {
  const [year, month] = period.split('-').map(Number)

  if (!year || !month) {
    return period
  }

  return month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, '0')}-01`
}

/** Returns the number of days in a billing period. */
export function daysInPeriod(
  period: string,
): number {
  const [year, month] = period.split('-').map(Number)

  if (!year || !month) {
    return 30
  }

  return new Date(
    Date.UTC(year, month, 0),
  ).getUTCDate()
}

/**
 * Calculates the due date for a billing period.
 *
 * Invalid dates such as day 31 in February are safely capped at the last
 * valid day of that month.
 */
export function dueDateFor(
  period: string,
  rentDueDay: number,
): string {
  const [year, month] = period.split('-').map(Number)

  if (!year || !month) {
    return period
  }

  const day = Math.min(
    Math.max(1, Math.round(rentDueDay)),
    daysInPeriod(period),
  )

  return [
    year,
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-')
}

/**
 * Calculates the number of days between two YYYY-MM-DD dates.
 *
 * A negative value means the target date is overdue.
 */
export function daysBetween(
  from: string,
  to: string,
): number {
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)

  if (Number.isNaN(start) || Number.isNaN(end)) {
    return 0
  }

  return Math.round((end - start) / DAY_MS)
}

/** Returns a readable label such as "September 2026". */
export function periodLabel(
  period: string,
): string {
  const [year, month] = period.split('-').map(Number)

  if (!year || !month) {
    return period
  }

  return new Date(
    Date.UTC(year, month - 1, 1),
  ).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * Creates a receipt number such as HC-2609-0001.
 */
export function receiptNumber(
  period: string,
  sequence: number,
): string {
  const [year, month] = period.split('-')
  const yy = (year ?? '').slice(2)
  const mm = month ?? '00'

  return `HC-${yy}${mm}-${String(
    Math.max(1, Math.floor(sequence)),
  ).padStart(4, '0')}`
}

/** Parses a receipt number back into its period and sequence. */
export function parseReceiptNumber(
  receipt: string,
): {
  period: string
  sequence: number
} | null {
  const match =
    /^HC-(\d{2})(\d{2})-(\d{4})$/.exec(
      receipt.trim().toUpperCase(),
    )

  if (!match) {
    return null
  }

  const [, year, month, sequence] = match
  const monthNumber = Number(month)

  if (monthNumber < 1 || monthNumber > 12) {
    return null
  }

  return {
    period: `20${year}-${month}-01`,
    sequence: Number(sequence),
  }
}

export type DueLike = {
  amount: number
  amountPaid: number
  dueDate: string
  status: string
}

function isSettledStatus(status: string): boolean {
  return status === 'paid' || status === 'waived'
}

/** Returns the unpaid amount for one due. */
export function outstandingOf(
  due: DueLike,
): number {
  if (isSettledStatus(due.status)) {
    return 0
  }

  return Math.max(
    0,
    Number(due.amount) - Number(due.amountPaid),
  )
}

export type BillingSummary = {
  billed: number
  collected: number
  outstanding: number
  broughtForward: number
  overdueCount: number
}

/**
 * Summarises dues for a flat or resident.
 *
 * Older unpaid dues remain attached to their original period and continue
 * appearing until they are fully settled.
 */
export function summarise(
  dues: DueLike[],
  period: string,
  today: string,
): BillingSummary {
  const monthKey = period.slice(0, 7)

  const thisMonth = dues.filter((due) =>
    due.dueDate.startsWith(monthKey),
  )

  return {
    billed: thisMonth.reduce(
      (sum, due) => sum + Number(due.amount),
      0,
    ),

    collected: thisMonth.reduce(
      (sum, due) => sum + Number(due.amountPaid),
      0,
    ),

    outstanding: dues.reduce(
      (sum, due) => sum + outstandingOf(due),
      0,
    ),

    broughtForward: dues
      .filter(
        (due) => !due.dueDate.startsWith(monthKey),
      )
      .reduce(
        (sum, due) => sum + outstandingOf(due),
        0,
      ),

    overdueCount: dues.filter(
      (due) =>
        outstandingOf(due) > 0 &&
        due.dueDate < today,
    ).length,
  }
}