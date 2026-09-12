import 'server-only'

import { listDuesForUser } from './dues.service'
import { listPaymentsForUser } from './payments.service'
import type { MemberCharge } from '@/components/money/member-handovers'

/**
 * A resident's side of the first hop: what they owe their moderator.
 *
 * Built from the two ledgers they already appear in — `dues` for what was
 * charged and `payments` for what they have recorded — rather than a third
 * table. A resident's obligation is not a separate fact from their dues; it is
 * the same fact seen from the other end, and giving it its own storage would
 * mean two numbers that can disagree.
 */
export async function listMemberCharges(
  userId: string,
  limit = 24,
): Promise<MemberCharge[]> {
  const [dues, payments] = await Promise.all([
    listDuesForUser(userId, limit).catch(() => []),
    listPaymentsForUser(userId, 120).catch(() => []),
  ])

  return dues
    .filter((due) => due.status !== 'waived')
    .map((due) => {
      const mine = payments.filter((payment) => payment.due_id === due.id)

      return {
        id: due.id,
        flatId: due.flat_id,
        unitNumber: mine[0]?.unitNumber ?? null,
        period: due.period,
        description: due.description,
        amount: Number(due.amount),
        amountPaid: Number(due.amount_paid),
        dueDate: due.due_date,
        status: due.status,

        // Confirmed payments carry a receipt number; nothing else does.
        receipts: mine
          .filter((payment) => payment.status === 'confirmed' && payment.receipt_no)
          .map((payment) => ({
            id: payment.id,
            amount: Number(payment.amount),
            paidAt: payment.paid_at,
            receiptNo: payment.receipt_no as string,
          })),

        /**
         * Recorded but not yet accepted. Deliberately not subtracted from the
         * balance: until the moderator confirms it, nobody has agreed the money
         * arrived, and showing a resident a lower balance for it would be
         * telling them they owe less than they do.
         */
        awaiting: mine
          .filter((payment) => payment.status === 'pending')
          .reduce((sum, payment) => sum + Number(payment.amount), 0),

        /**
         * Only rejections the resident has not already answered.
         *
         * Once they have recorded the charge again there is a pending
         * submission in the queue, and showing the old refusal beside it would
         * read as a second problem rather than the one they just fixed.
         */
        rejected: mine
          .filter(
            (payment) =>
              payment.status === 'rejected' &&
              !mine.some((other) => other.status === 'pending'),
          )
          .slice(0, 2)
          .map((payment) => ({
            id: payment.id,
            amount: Number(payment.amount),
            reason: payment.rejection_reason ?? null,
          })),
      }
    })
}