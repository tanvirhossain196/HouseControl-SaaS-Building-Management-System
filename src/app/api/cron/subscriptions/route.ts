import { NextResponse, type NextRequest } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { limitsFor } from '@/lib/pricing'
import { todayInDhaka } from '@/lib/billing'
import { hasLapsed } from '@/lib/subscription'
import { writeAuditLog } from '@/services/audit.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The daily subscription expiry job.
 *
 * Nothing renews automatically here — a plan is bought for a fixed number of
 * months and then it is over. This job is what makes "over" mean something:
 * it finds paid subscriptions whose end date has passed and moves them to
 * Free. That covers both a scheduled cancellation and a customer who simply
 * did not buy again.
 *
 * It writes the downgrade to the row rather than letting the billing page work
 * it out on the fly, because buildings.service.ts and flats.service.ts read
 * unit_limit and building_limit straight from the table. A plan that had
 * expired only in the eyes of one page would keep granting its limits
 * everywhere else.
 *
 * Authenticated by a shared secret, like the reminders job. Safe to run twice:
 * the second pass finds nothing left to change.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET

  if (!secret) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: 'internal_error', message: 'CRON_SECRET is not set.' },
      },
      { status: 500 },
    )
  }

  const provided =
    request.headers.get('authorization')?.replace(/^Bearer /i, '') ??
    request.headers.get('x-cron-secret') ??
    ''

  if (provided !== secret) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: 'forbidden', message: 'Bad cron secret.' },
      },
      { status: 403 },
    )
  }

  const today = todayInDhaka()
  const admin = createAdminSupabase()
  const free = limitsFor('free')

  const { data: candidates, error } = await admin
    .from('subscriptions')
    .select(
      'id, org_id, plan, status, current_period_start, current_period_end, cancel_at_period_end',
    )
    .neq('status', 'cancelled')
    .neq('plan', 'free')
    .lte('current_period_end', today)

  if (error) {
    console.error('[cron-subscriptions]', error.message)

    return NextResponse.json(
      { ok: false, error: { code: 'internal_error', message: error.message } },
      { status: 500 },
    )
  }

  const expired = (candidates ?? []).filter((row) => hasLapsed(row, today))

  let downgraded = 0

  for (const row of expired) {
    const { error: updateError } = await admin
      .from('subscriptions')
      .update({
        plan: 'free',
        status: 'active',
        unit_limit: free.units,
        building_limit: free.buildings,
        current_period_end: null,
        cancel_at_period_end: false,
        provider_reference: null,
      })
      .eq('id', row.id)
      .neq('plan', 'free')

    if (updateError) {
      console.error('[cron-subscriptions] downgrade failed', row.id, updateError.message)
      continue
    }

    downgraded += 1

    await writeAuditLog({
      orgId: row.org_id,
      action: row.cancel_at_period_end
        ? 'subscription.cancelled_at_period_end'
        : 'subscription.expired',
      entityType: 'subscription',
      entityId: row.id,
      before: { plan: row.plan, endedOn: row.current_period_end },
      after: { plan: 'free' },
    })
  }

  return NextResponse.json({
    ok: true,
    data: { checked: candidates?.length ?? 0, downgraded, today },
  })
}