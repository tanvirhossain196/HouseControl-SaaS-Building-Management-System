import { NextResponse, type NextRequest } from 'next/server'

import { createAdminSupabase } from '@/lib/supabase/admin'
import { billBuildingRent } from '@/services/dues.service'
import { periodOf, todayInDhaka } from '@/lib/billing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The monthly rent run.
 *
 * Rent should not depend on somebody remembering to press a button. This runs
 * every night and, on the first of the month, bills any building that has not
 * been billed for it yet. An owner who bills by hand on the 7th simply finds
 * nothing left for the job to do — billFlatRent skips a period it has already
 * raised, so running both is harmless.
 *
 * It uses the service-role client because there is no signed-in person at three
 * in the morning, and passes it down through billBuildingRent rather than
 * reimplementing any of the billing rules. The rules live in one place; only
 * the eyes reading the database change.
 *
 * Authenticated by a shared secret, like the other two jobs. Safe to run twice.
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
      { ok: false, error: { code: 'forbidden', message: 'Bad cron secret.' } },
      { status: 403 },
    )
  }

  const today = todayInDhaka()
  const period = periodOf()
  const isFirstOfMonth = today.endsWith('-01')

  // `force=1` bills the current month whatever the date, which is how this gets
  // tested without waiting for the calendar.
  const forced = request.nextUrl.searchParams.get('force') === '1'

  if (!isFirstOfMonth && !forced) {
    return NextResponse.json({
      ok: true,
      data: { skipped: 'not the first of the month', today, period },
    })
  }

  const admin = createAdminSupabase()

  const { data: buildings, error } = await admin
    .from('buildings')
    .select('id, name')
    .is('archived_at', null)

  if (error) {
    console.error('[cron-rent]', error.message)

    return NextResponse.json(
      { ok: false, error: { code: 'internal_error', message: error.message } },
      { status: 500 },
    )
  }

  let billedBuildings = 0
  let charges = 0
  let remittances = 0
  const problems: string[] = []

  for (const building of buildings ?? []) {
    try {
      /**
       * A null actor: nothing here was decided by a person, and naming one in
       * the audit trail would credit them with a choice they did not make.
       */
      const result = await billBuildingRent(null, building.id, period, undefined, admin)

      if (result.created > 0) billedBuildings += 1

      charges += result.created
      remittances += result.remittances?.created ?? 0

      for (const skipped of result.skipped) {
        problems.push(`${building.name} — ${skipped}`)
      }

      if (result.remittanceError) {
        problems.push(`${building.name} — ${result.remittanceError}`)
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'could not be billed'

      // A building with no occupied flats throws, and that is not a fault worth
      // failing the whole run over.
      problems.push(`${building.name} — ${message}`)
    }
  }

  console.info(
    '[cron-rent]',
    period,
    `${billedBuildings} buildings, ${charges} charges, ${remittances} remittances`,
  )

  return NextResponse.json({
    ok: true,
    data: {
      period,
      checked: buildings?.length ?? 0,
      billedBuildings,
      charges,
      remittances,
      problems,
    },
  })
}