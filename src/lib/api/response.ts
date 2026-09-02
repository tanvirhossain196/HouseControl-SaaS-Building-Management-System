import { NextResponse } from 'next/server'
import { toAppError } from '@/lib/errors'
import type { PagedResult } from '@/types'

/** Every successful API response has this shape. */
export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true as const, data }, { status: 200, ...init })
}

export function created<T>(data: T) {
  return NextResponse.json({ ok: true as const, data }, { status: 201 })
}

export function paged<T>(result: PagedResult<T>) {
  return NextResponse.json({ ok: true as const, ...result })
}

export function noContent() {
  return new NextResponse(null, { status: 204 })
}

/** Every failure has this shape: a machine code, a human message, field errors. */
export function fail(error: unknown) {
  const appError = toAppError(error)

  if (appError.status >= 500) {
    // Phase 15 sends this to Sentry instead.
    console.error('[api]', appError.message, appError.cause ?? '')
  }

  return NextResponse.json(
    {
      ok: false as const,
      error: {
        code: appError.code,
        message: appError.message,
        fields: appError.fieldErrors,
      },
    },
    { status: appError.status },
  )
}
