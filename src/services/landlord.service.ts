import 'server-only'

import { createServerSupabase } from '@/lib/supabase/server'
import { toAppError } from '@/lib/errors'
import { writeAuditLog } from './audit.service'
import type { LandlordRentInput } from '@/lib/validation/property'
import type { LandlordRentRow } from '@/types'

/**
 * Rent the organization pays the landlord — money going out, not coming in.
 *
 * Kept apart from `dues` on purpose: residents must never see it, and the RLS
 * policy on `landlord_rent_records` is admin-only for exactly that reason.
 */

export async function listLandlordRent(
  flatIds: string[],
  period: string,
): Promise<LandlordRentRow[]> {
  if (flatIds.length === 0) return []

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('landlord_rent_records')
    .select('*')
    .in('flat_id', flatIds)
    .eq('period', period)

  if (error) throw toAppError(error)
  return data
}

/** One record per flat per month — re-recording updates the existing row. */
export async function recordLandlordRent(
  userId: string,
  input: LandlordRentInput,
): Promise<LandlordRentRow> {
  const supabase = createServerSupabase()

  const { data, error } = await supabase
    .from('landlord_rent_records')
    .upsert(
      {
        flat_id: input.flatId,
        period: input.period,
        amount: input.amount,
        paid_at: input.paidAt ?? null,
        reference: input.reference ?? null,
        recorded_by: userId,
      },
      { onConflict: 'flat_id,period' },
    )
    .select('*')
    .single()

  if (error) throw toAppError(error)

  await writeAuditLog({
    actorId: userId,
    action: input.paidAt ? 'landlord_rent.paid' : 'landlord_rent.recorded',
    entityType: 'flat',
    entityId: input.flatId,
    after: { period: input.period, amount: input.amount, paidAt: input.paidAt ?? null },
  })

  return data
}
