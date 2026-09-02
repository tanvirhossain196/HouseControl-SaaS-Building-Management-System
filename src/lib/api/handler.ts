import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { AppError } from '@/lib/errors'
import { fail } from './response'
import { requireUser } from '@/lib/supabase/server'
import { assertPermission } from '@/lib/auth/guards'
import type { Permission, PermissionScope } from '@/lib/auth/permissions'

type Context<TBody, TQuery> = {
  request: NextRequest
  params: Record<string, string>
  body: TBody
  query: TQuery
  userId: string
}

type HandlerOptions<TBody, TQuery> = {
  /** Reject anonymous callers before the handler runs. Defaults to true. */
  auth?: boolean
  /**
   * Reject callers whose role does not grant this permission. `scope` reads
   * the org or flat id out of the parsed body, query or route params, so the
   * check is against the specific building rather than "anywhere".
   */
  permission?: Permission
  scope?: (ctx: {
    body: TBody
    query: TQuery
    params: Record<string, string>
  }) => PermissionScope
  /** z.ZodType<Output, Def, Input> — the third slot keeps defaults working. */
  body?: z.ZodType<TBody, z.ZodTypeDef, unknown>
  query?: z.ZodType<TQuery, z.ZodTypeDef, unknown>
}

/**
 * Wraps a route handler with the three things every endpoint needs: an auth
 * check, Zod validation of body and query, and one place that turns thrown
 * errors into the standard failure response.
 *
 *   export const POST = route(
 *     { body: createBuildingSchema },
 *     async ({ body, userId }) => created(await buildings.create(userId, body)),
 *   )
 */
export function route<TBody = undefined, TQuery = undefined>(
  options: HandlerOptions<TBody, TQuery>,
  handler: (ctx: Context<TBody, TQuery>) => Promise<Response>,
) {
  return async (
    request: NextRequest,
    segment: { params?: Record<string, string> } = {},
  ) => {
    try {
      let userId = ''
      if (options.auth !== false) {
        const user = await requireUser()
        userId = user.id
      }

      let body = undefined as TBody
      if (options.body) {
        const raw = await request.json().catch(() => {
          throw new AppError('bad_request', 'The request body is not valid JSON.')
        })
        body = parseOrThrow(options.body, raw, 'body')
      }

      let query = undefined as TQuery
      if (options.query) {
        const raw = Object.fromEntries(request.nextUrl.searchParams.entries())
        query = parseOrThrow(options.query, raw, 'query')
      }

      if (options.permission) {
        const scope = options.scope?.({ body, query, params: segment.params ?? {} }) ?? {}
        await assertPermission(options.permission, scope)
      }

      return await handler({
        request,
        params: segment.params ?? {},
        body,
        query,
        userId,
      })
    } catch (error) {
      return fail(error)
    }
  }
}

function parseOrThrow<T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  value: unknown,
  source: 'body' | 'query',
): T {
  const result = schema.safeParse(value)
  if (result.success) return result.data

  const fieldErrors: Record<string, string[]> = {}
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || source
    ;(fieldErrors[key] ??= []).push(issue.message)
  }

  throw new AppError('validation_failed', 'Some fields need fixing.', { fieldErrors })
}
