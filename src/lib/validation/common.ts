import { z } from 'zod'

/** Shared field rules. Import these instead of retyping regexes per schema. */
export const uuid = z.string().uuid('Not a valid id.')

export const bdPhone = z
  .string()
  .trim()
  .regex(/^(\+?88)?01[3-9]\d{8}$/, 'Use a Bangladeshi mobile number, e.g. 01712345678.')

export const email = z.string().trim().toLowerCase().email('Use a valid email address.')

export const money = z
  .number({ invalid_type_error: 'Enter an amount.' })
  .nonnegative('Amount cannot be negative.')
  .max(100_000_000, 'That amount looks wrong.')
  .multipleOf(0.01, 'Use at most two decimal places.')

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD.')

/** First day of a month, the key every due and expense is filed under. */
export const period = z
  .string()
  .regex(/^\d{4}-\d{2}-01$/, 'Use the first day of the month, e.g. 2026-09-01.')

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  sort: z.string().max(40).optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
})

export type Pagination = z.infer<typeof paginationSchema>
