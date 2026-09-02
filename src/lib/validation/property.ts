import { z } from 'zod'
import { money, uuid } from './common'

export const createBuildingSchema = z.object({
  orgId: uuid,
  name: z.string().trim().min(2, 'Give the building a name.').max(120),
  addressLine: z.string().trim().min(5, 'Add a street address.').max(240),
  area: z.string().trim().max(120).optional(),
  city: z.string().trim().max(80).default('Dhaka'),
  postcode: z.string().trim().max(12).optional(),
  floorsCount: z.coerce.number().int().min(1).max(200),
  amenities: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  photoUrl: z.string().url().optional(),
  notes: z.string().trim().max(2000).optional(),
})

export const updateBuildingSchema = createBuildingSchema.partial().omit({ orgId: true })

export const createFlatSchema = z.object({
  buildingId: uuid,
  unitNumber: z.string().trim().min(1, 'Give the unit a number.').max(16),
  floor: z.coerce.number().int().min(-3).max(200),
  sizeSqft: z.coerce.number().int().min(50).max(20_000).optional(),
  bedrooms: z.coerce.number().int().min(0).max(20).optional(),
  monthlyRent: money,
  landlordRent: money.default(0),
  rentDueDay: z.coerce
    .number()
    .int()
    .min(1)
    .max(28, 'Pick a day between 1 and 28 so every month has one.')
    .default(5),
  occupancyStatus: z
    .enum(['occupied', 'vacant', 'reserved', 'not_rentable'])
    .default('vacant'),
})

export const updateFlatSchema = createFlatSchema.partial().omit({ buildingId: true })

/**
 * Rent shares must add up to the flat's rent — the same rule the database
 * enforces in 0006, checked here so the form can show it inline.
 */
export const rentSplitSchema = z
  .object({
    flatId: uuid,
    monthlyRent: money,
    shares: z
      .array(z.object({ userId: uuid, amount: money }))
      .min(1, 'Add at least one resident.'),
  })
  .refine(
    (value) =>
      Math.abs(value.shares.reduce((sum, s) => sum + s.amount, 0) - value.monthlyRent) <
      0.01,
    { message: 'Shares must add up to the flat rent.', path: ['shares'] },
  )

export type CreateBuildingInput = z.infer<typeof createBuildingSchema>
export type CreateFlatInput = z.infer<typeof createFlatSchema>
export type RentSplitInput = z.infer<typeof rentSplitSchema>
