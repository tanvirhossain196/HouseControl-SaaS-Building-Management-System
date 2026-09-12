import { todayInDhaka } from './billing'
import { planById, type PlanId } from './pricing'

/**
 * How much of a subscription is left, and what to call the state it is in.
 *
 * Kept free of database and React so both the billing page and the expiry cron
 * reach the same verdict from the same row, and so it can be tested directly.
 *
 * Dates are handled as plain YYYY-MM-DD strings in Dhaka time, matching the
 * `date` columns they come from. Building Date objects from them would drag the
 * server's timezone into the answer, and "3 days left" turning into "2 days
 * left" because the server sits in UTC is exactly the kind of bug nobody
 * reports and everybody notices.
 */

export type SubscriptionRow = {
  plan?: string | null
  status?: string | null
  current_period_start?: string | null
  current_period_end?: string | null
  cancel_at_period_end?: boolean | null
}

export type SubscriptionState =
  /** No paid plan. */
  | 'free'
  /** Paid and running. */
  | 'active'
  /** Paid, running, but will drop to free on the end date. */
  | 'ending'
  /** The end date has passed and nothing has downgraded it yet. */
  | 'expired'
  /** Payment failed or was never completed. */
  | 'past_due'

export type SubscriptionView = {
  state: SubscriptionState
  planId: PlanId
  planName: string
  /** Whole days from today until the end date. Null when there is no end date. */
  daysLeft: number | null
  startedOn: string | null
  endsOn: string | null
  cancelAtPeriodEnd: boolean
  /** True for a paid plan that is still in force. */
  paid: boolean
}

const DAY_MS = 86_400_000

/** Parses YYYY-MM-DD as a UTC midnight, so no local timezone creeps in. */
function toUtcDay(date: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date)
  if (!match) return null

  const [, year, month, day] = match
  return Date.UTC(Number(year), Number(month) - 1, Number(day))
}

/**
 * Whole days from `from` until `date`. Negative once the date has passed, so
 * -1 means yesterday. Returns null if either date cannot be read.
 */
export function daysUntil(
  date: string | null | undefined,
  from: string = todayInDhaka(),
): number | null {
  if (!date) return null

  const target = toUtcDay(date)
  const start = toUtcDay(from)

  if (target === null || start === null) return null

  return Math.round((target - start) / DAY_MS)
}

/** Reads one subscription row into everything the UI and the cron need. */
export function describeSubscription(
  row: SubscriptionRow | null | undefined,
  today: string = todayInDhaka(),
): SubscriptionView {
  const planId = (row?.plan ?? 'free') as PlanId
  const plan = planById(planId)
  const endsOn = row?.current_period_end ?? null
  const daysLeft = daysUntil(endsOn, today)
  const cancelAtPeriodEnd = row?.cancel_at_period_end === true

  const isPaidPlan = planId !== 'free' && (plan?.monthly ?? 0) > 0

  let state: SubscriptionState = 'free'

  if (row?.status === 'past_due') {
    state = 'past_due'
  } else if (!isPaidPlan) {
    state = 'free'
  } else if (daysLeft !== null && daysLeft < 0) {
    state = 'expired'
  } else if (cancelAtPeriodEnd) {
    state = 'ending'
  } else {
    state = 'active'
  }

  return {
    state,
    planId,
    planName: plan?.name ?? 'Free',
    daysLeft,
    startedOn: row?.current_period_start ?? null,
    endsOn,
    cancelAtPeriodEnd,
    paid: isPaidPlan && state !== 'expired',
  }
}

/** True once a paid plan has run past its end date and should drop to free. */
export function hasLapsed(
  row: SubscriptionRow | null | undefined,
  today: string = todayInDhaka(),
): boolean {
  return describeSubscription(row, today).state === 'expired'
}

/**
 * The same day-of-month, `months` later.
 *
 * A subscription runs from the day it was bought, not from the first of the
 * month. periodOf() exists for rent, where a month really is a bucket from the
 * 1st, and using it here quietly shortened every plan: bought on the 9th, a
 * one-month plan ran out on the 1st — eight days lost, and twenty-eight if
 * someone bought on the 28th.
 *
 * The day is clamped to the length of the target month, so 31 January plus one
 * month is 28 February rather than spilling into March.
 */
export function addMonths(date: string, months: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date)
  if (!match) return date

  const [, yearText, monthText, dayText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)

  const total = (year * 12 + (month - 1)) + months
  const targetYear = Math.floor(total / 12)
  const targetMonth = (total % 12) + 1

  // Day 0 of the following month is the last day of this one.
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate()
  const targetDay = Math.min(day, lastDay)

  return [
    String(targetYear).padStart(4, '0'),
    String(targetMonth).padStart(2, '0'),
    String(targetDay).padStart(2, '0'),
  ].join('-')
}

/** "9 September 2026" — the same wording everywhere, no locale surprises. */
export function formatDay(date: string | null | undefined): string {
  if (!date) return '—'

  const utc = toUtcDay(date)
  if (utc === null) return '—'

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(utc))
}

/** "12 days left", "Ends today", "Expired 3 days ago". */
export function remainingLabel(view: SubscriptionView): string {
  if (!view.paid && view.state !== 'expired') return 'No expiry'
  if (view.daysLeft === null) return 'No end date'

  if (view.daysLeft < 0) {
    const days = Math.abs(view.daysLeft)
    return `Expired ${days} day${days === 1 ? '' : 's'} ago`
  }

  if (view.daysLeft === 0) return 'Ends today'
  if (view.daysLeft === 1) return '1 day left'

  return `${view.daysLeft} days left`
}