import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Merge conditional class names without Tailwind conflicts. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format an amount in Bangladeshi Taka, e.g. 18500 -> "৳18,500". */
export function formatTaka(amount: number) {
  return `৳${new Intl.NumberFormat('en-BD', { maximumFractionDigits: 0 }).format(amount)}`
}

/** Human due-date label, e.g. "Due in 3 days" / "2 days overdue". */
/**
 * The day of the month a charge turns overdue.
 *
 * A calendar deadline, not a countdown from the due date. Rent for September is
 * overdue after the 10th of September however late in the month it was actually
 * billed — so a landlord who bills on the 7th and one who bills on the 2nd are
 * chasing the same people on the same day, and a resident cannot buy themselves
 * extra time by being billed late.
 */
export const OVERDUE_DAY = 10

export type Lateness = 'upcoming' | 'due' | 'late' | 'overdue'

/** The date a charge belonging to `period` turns overdue. */
export function overdueOn(period: string): string {
  return `${period.slice(0, 7)}-${String(OVERDUE_DAY).padStart(2, '0')}`
}

/** Whole days from `from` until `date`; negative once it has passed. */
export function daysBetween(from: string, date: string): number {
  const parse = (value: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
    if (!match) return null
    return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  }

  const start = parse(from)
  const end = parse(date)

  if (start === null || end === null) return 0

  return Math.round((end - start) / 86_400_000)
}

/**
 * One rule for the whole app, so a badge and a report never disagree.
 *
 * `period` is what decides overdue. Without it — a one-off charge with no month
 * behind it — the due date is all there is, and the tenth day after it stands in
 * for the tenth of the month.
 */
export function latenessOf(input: {
  dueDate: string
  today: string
  period?: string | null
}): Lateness {
  const untilDue = daysBetween(input.today, input.dueDate)
  const cutoff = input.period
    ? overdueOn(input.period)
    : addDaysTo(input.dueDate, OVERDUE_DAY)

  if (daysBetween(input.today, cutoff) < 0) return 'overdue'
  if (untilDue < 0) return 'late'
  if (untilDue > 3) return 'upcoming'

  return 'due'
}

function addDaysTo(date: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date)
  if (!match) return date

  const shifted = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days),
  )

  return shifted.toISOString().slice(0, 10)
}

/**
 * The words on the badge.
 *
 * Takes the state rather than working it out, so the wording and the colour
 * cannot drift apart — they are decided by the same call.
 */
export function dueLabel(daysFromToday: number, state?: Lateness) {
  if (daysFromToday === 0 && state !== 'overdue') return 'Due today'

  if (daysFromToday > 0) {
    return state === 'overdue'
      ? 'Overdue'
      : `Due in ${daysFromToday} day${daysFromToday === 1 ? '' : 's'}`
  }

  const late = Math.abs(daysFromToday)
  const word = late === 1 ? 'day' : 'days'

  // "Late" is the only warning before the badge turns red, so it says which.
  return state === 'overdue' ? `${late} ${word} overdue` : `${late} ${word} late`
}
