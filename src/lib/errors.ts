/**
 * One error type for the whole application. Anything thrown inside a service
 * or a route handler is turned into an AppError before it reaches the client,
 * so responses never leak stack traces or Postgres internals.
 */
export type ErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'validation_failed'
  | 'rate_limited'
  | 'plan_limit_reached'
  | 'internal_error'

const statusByCode: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  validation_failed: 422,
  rate_limited: 429,
  plan_limit_reached: 402,
  internal_error: 500,
}

export class AppError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly fieldErrors?: Record<string, string[]>
  readonly cause?: unknown

  constructor(
    code: ErrorCode,
    message: string,
    options?: { fieldErrors?: Record<string, string[]>; cause?: unknown },
  ) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.status = statusByCode[code]
    this.fieldErrors = options?.fieldErrors
    this.cause = options?.cause
  }
}

export const badRequest = (m: string) => new AppError('bad_request', m)
export const unauthorized = (m = 'Sign in to continue.') =>
  new AppError('unauthorized', m)
export const forbidden = (m = 'You do not have access to this.') =>
  new AppError('forbidden', m)
export const notFound = (what = 'That') =>
  new AppError('not_found', `${what} was not found.`)
export const conflict = (m: string) => new AppError('conflict', m)

/** Postgres error codes that map to something a person can act on. */
const postgresMessages: Record<string, { code: ErrorCode; message: string }> = {
  '23505': { code: 'conflict', message: 'That already exists.' },
  '23503': { code: 'bad_request', message: 'A referenced record does not exist.' },
  '23514': {
    code: 'validation_failed',
    message: 'That value breaks a rule on this record.',
  },
  '42501': { code: 'forbidden', message: 'You do not have access to this.' },
  PGRST116: { code: 'not_found', message: 'That was not found.' },
}

/** Normalise anything thrown — Supabase errors, Zod errors, plain throws. */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error

  if (typeof error === 'object' && error !== null && 'code' in error) {
    const pgCode = String((error as { code: unknown }).code)
    const mapped = postgresMessages[pgCode]
    if (mapped) {
      const detail = (error as { message?: string }).message
      return new AppError(mapped.code, mapped.message, { cause: detail })
    }
  }

  return new AppError('internal_error', 'Something went wrong on our side.', {
    cause: error,
  })
}
