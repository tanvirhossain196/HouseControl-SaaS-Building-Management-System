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
export function dueLabel(daysFromToday: number) {
  if (daysFromToday === 0) return 'Due today'
  if (daysFromToday > 0)
    return `Due in ${daysFromToday} day${daysFromToday === 1 ? '' : 's'}`
  const late = Math.abs(daysFromToday)
  return `${late} day${late === 1 ? '' : 's'} overdue`
}
