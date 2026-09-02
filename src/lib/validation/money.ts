import { z } from 'zod'
import { isoDate, money, period, uuid } from './common'

export const submitPaymentSchema = z.object({
  flatId: uuid,
  dueId: uuid.optional(),
  amount: money.refine((v) => v > 0, 'Enter an amount above zero.'),
  method: z.enum(['cash', 'bkash', 'nagad', 'bank_transfer', 'card', 'other']),
  paidAt: isoDate,
  reference: z.string().trim().max(80).optional(),
  proofUrl: z.string().url().optional(),
  note: z.string().trim().max(500).optional(),
})

export const reviewPaymentSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('confirm'), paymentId: uuid }),
  z.object({
    decision: z.literal('reject'),
    paymentId: uuid,
    reason: z.string().trim().min(5, 'Tell the resident why it was rejected.').max(300),
  }),
])

export const createExpenseSchema = z.object({
  buildingId: uuid,
  flatId: uuid.optional(),
  scope: z.enum(['building', 'flat']).default('building'),
  category: z.enum([
    'electricity',
    'gas',
    'water',
    'internet',
    'cleaning',
    'security',
    'lift',
    'repair',
    'other',
  ]),
  title: z.string().trim().min(2).max(160),
  amount: money.refine((v) => v > 0, 'Enter an amount above zero.'),
  period,
  splitMethod: z.enum(['equal', 'custom', 'by_unit_size', 'by_usage']).default('equal'),
  shares: z.array(z.object({ flatId: uuid, amount: money })).optional(),
})

export type SubmitPaymentInput = z.infer<typeof submitPaymentSchema>
export type ReviewPaymentInput = z.infer<typeof reviewPaymentSchema>
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>
