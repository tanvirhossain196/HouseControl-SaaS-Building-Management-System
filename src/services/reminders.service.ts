import 'server-only'

import { createAdminSupabase } from '@/lib/supabase/admin'
import { notify } from './notifications.service'
import { daysUntil } from './dues.service'
import { todayInDhaka } from '@/lib/billing'

/**
 * Rent reminders.
 *
 * Run daily. Everything here is idempotent through the dedupe key on
 * `notifications`, so running it twice in an hour — or a cron provider firing
 * a retry — sends nothing the second time.
 *
 * The schedule is deliberately quiet: three days before, on the day, and then
 * weekly once overdue. A daily nag about the same unpaid rent teaches people
 * to mute the app, and a muted app is worse than no reminder.
 */

const REMIND_BEFORE_DAYS = 3
const OVERDUE_EVERY_DAYS = 7

export type ReminderRun = {
  upcoming: number
  dueToday: number
  overdue: number
  skipped: number
}

export async function sendDueReminders(now: Date = new Date()): Promise<ReminderRun> {
  const admin = createAdminSupabase()
  const today = todayInDhaka(now)
  const run: ReminderRun = { upcoming: 0, dueToday: 0, overdue: 0, skipped: 0 }

  const { data: dues } = await admin
    .from('dues')
    .select(
      'id, user_id, flat_id, amount, amount_paid, due_date, description, flats(unit_number)',
    )
    .in('status', ['open', 'partially_paid'])
    .not('user_id', 'is', null)
    .limit(2000)

  // Embedded selects are not expressible in the hand-written Database type.
  const rows = (dues ?? []) as unknown as {
    id: string
    user_id: string
    flat_id: string
    amount: number
    amount_paid: number
    due_date: string
    description: string | null
    flats: { unit_number: string } | null
  }[]

  for (const due of rows) {
    const days = daysUntil(due.due_date, today)
    const outstanding = Number(due.amount) - Number(due.amount_paid)
    if (outstanding <= 0) continue

    const shared = {
      userId: due.user_id,
      subjectId: due.id,
      link: '/dues',
      data: {
        amount: outstanding.toLocaleString('en-BD'),
        dueDate: due.due_date,
        description: due.description ?? 'Rent',
        unit: due.flats?.unit_number ?? '',
        days: String(Math.abs(days)),
      },
    }

    if (days === REMIND_BEFORE_DAYS) {
      await notify({ ...shared, event: 'due.reminder' })
      run.upcoming += 1
      continue
    }

    if (days === 0) {
      await notify({ ...shared, event: 'due.reminder' })
      run.dueToday += 1
      continue
    }

    // Once overdue, weekly rather than daily.
    if (days < 0 && Math.abs(days) % OVERDUE_EVERY_DAYS === 0) {
      await notify({ ...shared, event: 'due.overdue' })
      run.overdue += 1
      continue
    }

    run.skipped += 1
  }

  return run
}

/**
 * Releases messages that arrived during quiet hours.
 *
 * The in-app row went out immediately; this is the SMS and push that were
 * held back so nobody's phone lit up at 3am.
 */
export async function releaseHeldNotifications(now: Date = new Date()): Promise<number> {
  const admin = createAdminSupabase()

  const { data } = await admin
    .from('notifications')
    .select('id')
    .not('send_after', 'is', null)
    .lte('send_after', now.toISOString())
    .limit(500)

  if (!data?.length) return 0

  await admin
    .from('notifications')
    .update({ send_after: null })
    .in(
      'id',
      data.map((row) => row.id),
    )

  return data.length
}
