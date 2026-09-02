import { z } from 'zod'

/**
 * Environment variables, validated once and typed everywhere.
 *
 * Validation is lazy so that `next build` does not fail on a machine that has
 * no secrets yet — it fails at the moment something actually needs a value,
 * with a message naming the missing key.
 */
const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20, 'SUPABASE_SERVICE_ROLE_KEY is missing'),
  DATABASE_URL: z.string().url().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(60),
  ALLOWED_ORIGINS: z.string().optional(),
})

const publicSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('NEXT_PUBLIC_SUPABASE_URL must be a URL'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(20, 'NEXT_PUBLIC_SUPABASE_ANON_KEY is missing'),
})

function parse<T extends z.ZodTypeAny>(
  schema: T,
  source: Record<string, unknown>,
): z.infer<T> {
  const result = schema.safeParse(source)
  if (!result.success) {
    const missing = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('\n  ')
    throw new Error(`Environment is not configured.\n  ${missing}\n\nSee .env.example.`)
  }
  return result.data
}

let cachedServer: z.infer<typeof serverSchema> | null = null
let cachedPublic: z.infer<typeof publicSchema> | null = null

/** Server-only secrets. Throws if called from the browser. */
export function serverEnv() {
  if (typeof window !== 'undefined') {
    throw new Error('serverEnv() was called in the browser. Use publicEnv() instead.')
  }
  cachedServer ??= parse(serverSchema, process.env)
  return cachedServer
}

/** Values safe to ship to the browser. */
export function publicEnv() {
  cachedPublic ??= parse(publicSchema, {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  })
  return cachedPublic
}

export const isProduction = process.env.NODE_ENV === 'production'
