import { pageMetadata } from '@/lib/seo'
import { requireSession } from '@/lib/auth/session'
import { sessionRole } from '@/lib/auth/guards'
import {
  listModeratorRemittances,
  listPendingRemittancePayments,
} from '@/services/remittances.service'
import { formatTaka, latenessOf } from '@/lib/utils'
import { todayInDhaka } from '@/lib/billing'
import { daysUntil } from '@/lib/subscription'

import { PageHeader } from '@/components/layout/page-header'
import { Stat } from '@/components/dashboard/stat'
import { RemittanceList } from '@/components/money/remittance-list'
import { RemittanceQueue } from '@/components/money/remittance-queue'
import { MemberHandovers } from '@/components/money/member-handovers'
import { listMemberCharges } from '@/services/member-handovers.service'
import { ReviewQueue } from '@/components/money/review-queue'
import { listPendingPayments } from '@/services/payments.service'
import { reviewableFlatIds, listReviewScope } from '@/lib/auth/reviewable'

export const metadata = pageMetadata({
  title: 'Handovers',
  description: 'What moderators owe the owner, and what has been handed over.',
  path: '/remittances',
  noIndex: true,
})

/**
 * The second hop of the rent, on one screen.
 *
 * Both halves are shown to whoever has them. An owner who also moderates a
 * building of their own sees their obligations above their queue, which is
 * correct — the roles are not exclusive, and hiding one behind a toggle would
 * mean someone eventually misses a deadline they did not know they had.
 */
export default async function RemittancesPage() {
  const session = await requireSession('/remittances')
  const role = sessionRole(session)
  const canReview = role === 'admin' || role === 'super_admin'

  /**
   * Everything about money moving through this person, in one place.
   *
   * Incoming is what residents have handed them; outgoing is what they owe the
   * owner. Those two used to live on separate screens, which meant a moderator
   * confirming a resident's rent had to go somewhere else to hand it on — and
   * the two halves of the same month never appeared together.
   */
  const flatIds = await reviewableFlatIds(session).catch(() => [] as string[])
  const scope = await listReviewScope(session).catch(() => [])

  const [mine, queue, charges, incoming] = await Promise.all([
    listModeratorRemittances(session.userId).catch(() => []),
    canReview ? listPendingRemittancePayments().catch(() => []) : Promise.resolve([]),
    listMemberCharges(session.userId).catch(() => []),
    flatIds.length ? listPendingPayments(flatIds).catch(() => []) : Promise.resolve([]),
  ])

  const today = todayInDhaka()

  const owed = mine.reduce((sum, row) => {
    const outstanding = Number(row.amount) - Number(row.amount_paid)
    return sum + (outstanding > 0 ? outstanding : 0)
  }, 0)

  const late = mine.filter((row) => {
    const outstanding = Number(row.amount) - Number(row.amount_paid)
    if (outstanding <= 0) return false

    return latenessOf({ dueDate: row.due_date, period: row.period, today }) === 'overdue'
  }).length

  const waiting = queue.reduce((sum, row) => sum + Number(row.amount), 0)

  /**
   * A resident's own charges. Shown to anyone who has them, including a
   * moderator who lives in one of the flats they run — the roles are not
   * exclusive, and hiding one behind the other is how someone misses a month.
   */
  const owedToModerator = charges.reduce((sum, charge) => {
    const outstanding = charge.amount - charge.amountPaid
    return sum + (outstanding > 0 ? outstanding : 0)
  }, 0)

  return (
    /*
    No container of its own. The app shell's <main> already centres to 1600px
    and sets the padding, so a wrapper here only narrows the page and pads it
    twice — which is why this screen looked cramped next to Flats and Dues.
  */
    <>
      <PageHeader
        title="Handovers"
        description="Rent moves twice: residents pay their moderator, the moderator pays the owner. Both hops are here — what is coming to you, and what you owe on."
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {mine.length > 0 && (
          <Stat
            label="You owe the owner"
            value={formatTaka(owed)}
            hint={owed > 0 ? 'Across all your buildings' : 'Nothing outstanding'}
          />
        )}

        {charges.length > 0 && (
          <Stat
            label="You owe your moderator"
            value={formatTaka(owedToModerator)}
            hint={owedToModerator > 0 ? 'Rent and shared bills' : 'Nothing outstanding'}
          />
        )}

        {mine.length > 0 && (
          <Stat
            label="Past its date"
            value={String(late)}
            hint={late > 0 ? 'Hand these over first' : 'Nothing overdue'}
          />
        )}

        {incoming.length > 0 && (
          <Stat
            label="Residents waiting on you"
            value={formatTaka(
              incoming.reduce((sum, payment) => sum + Number(payment.amount), 0),
            )}
            hint={`${incoming.length} payment${incoming.length === 1 ? '' : 's'} to review`}
          />
        )}

        {canReview && queue.length > 0 && (
          <Stat
            label="Moderators waiting on you"
            value={formatTaka(waiting)}
            hint={`${queue.length} handover${queue.length === 1 ? '' : 's'} to review`}
          />
        )}
      </div>

      {incoming.length > 0 && (
        <section className="mt-10">
          <h2 className="text-title text-ink">Incoming — from your residents</h2>

          <p className="mt-1 max-w-[62ch] text-sm leading-relaxed text-muted">
            A resident says they have paid you. Check it against what actually reached you
            before accepting — confirming is what clears their balance and issues their
            receipt.
          </p>

          <div className="mt-4">
            <ReviewQueue payments={incoming} scope={scope} />
          </div>
        </section>
      )}

      {canReview && queue.length > 0 && (
        <section className="mt-10">
          <h2 className="text-title text-ink">Incoming — from your moderators</h2>

          <p className="mt-1 max-w-[62ch] text-sm leading-relaxed text-muted">
            A moderator says they have handed this money over. Check it against what
            actually reached you before accepting — confirming is what moves the balance.
          </p>

          <div className="mt-4">
            <RemittanceQueue submissions={queue} />
          </div>
        </section>
      )}

      {charges.length > 0 && (
        <section className="mt-10">
          <h2 className="text-title text-ink">Outgoing — to your moderator</h2>

          <p className="mt-1 max-w-[62ch] text-sm leading-relaxed text-muted">
            Pay your moderator directly, then record it here so the ledger matches.
            Nothing clears until they confirm it, and the receipt arrives when they do.
          </p>

          <div className="mt-4">
            <MemberHandovers charges={charges} />
          </div>
        </section>
      )}

      {mine.length > 0 && (
        <section className="mt-10">
          <h2 className="text-title text-ink">Outgoing — to the owner</h2>

          <p className="mt-1 max-w-[62ch] text-sm leading-relaxed text-muted">
            This is the full rent of the flats you cover, whether or not every resident
            has paid you yet. Chasing what is short is your side of the arrangement.
          </p>

          <div className="mt-4">
            <RemittanceList rows={mine} />
          </div>
        </section>
      )}
    </>
  )
}
