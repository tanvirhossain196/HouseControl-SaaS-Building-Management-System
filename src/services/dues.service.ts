import 'server-only'

import { createServerSupabase } from '@/lib/supabase/server'
import { toAppError } from '@/lib/errors'
import type { DueRow } from '@/types'

/** The ledger read side. Writes arrive in Phase 7. */

export type DuesSummary = {
  billed: number
  collected: number
  outstanding: number
  overdueCount: number
}

/** What one resident owes right now, oldest first. */
export async function listOpenDuesForUser(userId: string): Promise<DueRow[]> {
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('dues')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['open', 'partially_paid'])
    .order('due_date', { ascending: true })

  if (error) throw toAppError(error)
  return data
}

/** Collection progress for one flat in one month. */
export async function summariseFlatMonth(
  flatId: string,
  period: string,
): Promise<DuesSummary> {
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('dues')
    .select('amount, amount_paid, due_date, status')
    .eq('flat_id', flatId)
    .eq('period', period)

  if (error) throw toAppError(error)

  const today = new Date().toISOString().slice(0, 10)

  return data.reduce<DuesSummary>(
    (summary, due) => {
      summary.billed += Number(due.amount)
      summary.collected += Number(due.amount_paid)
      summary.outstanding += Number(due.amount) - Number(due.amount_paid)
      if (due.status !== 'paid' && due.due_date < today) summary.overdueCount += 1
      return summary
    },
    { billed: 0, collected: 0, outstanding: 0, overdueCount: 0 },
  )
}

/** Days until a due date; negative means overdue. Pairs with dueLabel(). */
export function daysUntil(dueDate: string, today = new Date()): number {
  const target = new Date(`${dueDate}T00:00:00Z`).getTime()
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  return Math.round((target - now) / 86_400_000)
}
