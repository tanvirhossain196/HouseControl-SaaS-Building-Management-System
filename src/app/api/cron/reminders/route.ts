import { NextResponse, type NextRequest } from 'next/server'
import { releaseHeldNotifications, sendDueReminders } from '@/services/reminders.service'

/**
 * The daily reminder job.
 *
 * Called by a scheduler — Vercel Cron, GitHub Actions, or a crontab with
 * `curl`. Authenticated by a shared secret in a header rather than a session,
 * because no person is involved.
 *
 * Safe to call more than once: every notification it sends carries a dedupe
 * key, so a double fire produces one message.
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

  if (!timingSafeEqual(provided, secret)) {
    // Deliberately terse. An unauthenticated caller learns nothing.
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  try {
    const [reminders, released] = await Promise.all([
      sendDueReminders(),
      releaseHeldNotifications(),
    ])

    return NextResponse.json({ ok: true, data: { ...reminders, released } })
  } catch (error) {
    console.error('[cron] reminders failed', error)
    return NextResponse.json(
      { ok: false, error: { code: 'internal_error' } },
      { status: 500 },
    )
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index)
  }
  return diff === 0
}

export const dynamic = 'force-dynamic'
