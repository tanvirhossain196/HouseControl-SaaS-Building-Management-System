import { pageMetadata } from '@/lib/seo'
import { requireSession } from '@/lib/auth/session'
import { sessionCan } from '@/lib/auth/guards'
import { createServerSupabase } from '@/lib/supabase/server'
import { listPaymentsForFlats, listPendingPayments } from '@/services/payments.service'
import { formatTaka } from '@/lib/utils'
import { periodOf, periodLabel } from '@/lib/billing'
import { PageHeader, EmptyState } from '@/components/layout/page-header'
import { Stat } from '@/components/dashboard/stat'
import { Tabs } from '@/components/ui/tabs'
import { ReviewQueue } from '@/components/money/review-queue'
import { PaymentHistory } from '@/components/money/payment-history'

export const metadata = pageMetadata({
  title: 'Payments',
  description: 'Confirm what has come in.',
  path: '/payments',
  noIndex: true,
})

/**
 * Every flat this person may review payments for: the ones they moderate,
 * plus every flat in an organization they own.
 */
async function reviewableFlatIds(
  session: Awaited<ReturnType<typeof requireSession>>,
): Promise<string[]> {
  const moderated = session.memberships.flats
    .filter((flat) => flat.role === 'moderator')
    .map((flat) => flat.flatId)

  const adminOrgs = session.memberships.orgs
    .filter((org) => org.role === 'admin')
    .map((org) => org.orgId)

  if (adminOrgs.length === 0) return moderated

  const supabase = createServerSupabase()
  const { data: buildings } = await supabase
    .from('buildings')
    .select('id')
    .in('org_id', adminOrgs)
    .is('archived_at', null)

  const buildingIds = (buildings ?? []).map((building) => building.id)
  if (buildingIds.length === 0) return moderated

  const { data: flats } = await supabase
    .from('flats')
    .select('id')
    .in('building_id', buildingIds)
    .is('archived_at', null)

  return [...new Set([...moderated, ...(flats ?? []).map((flat) => flat.id)])]
}

export default async function PaymentsPage() {
  const session = await requireSession('/payments')

  if (!sessionCan(session, 'payment.review')) {
    return (
      <>
        <PageHeader title="Payments" />
        <EmptyState
          title="Not your screen"
          body="Confirming payments is a moderator's job. Your own payments are on the My dues page."
        />
      </>
    )
  }

  const flatIds = await reviewableFlatIds(session)
  const [pending, history] = await Promise.all([
    listPendingPayments(flatIds).catch(() => []),
    listPaymentsForFlats(flatIds).catch(() => []),
  ])

  const period = periodOf()
  const confirmedThisMonth = history.filter(
    (payment) =>
      payment.status === 'confirmed' && payment.paid_at.startsWith(period.slice(0, 7)),
  )
  const collected = confirmedThisMonth.reduce(
    (sum, payment) => sum + Number(payment.amount),
    0,
  )
  const waiting = pending.reduce((sum, payment) => sum + Number(payment.amount), 0)

  return (
    <>
      <PageHeader
        title="Payments"
        description="Nothing moves on the ledger until you confirm it here."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat
          label="Waiting on you"
          value={String(pending.length)}
          tone={pending.length > 0 ? 'due' : 'paid'}
          hint={pending.length > 0 ? `${formatTaka(waiting)} claimed` : 'Queue is clear'}
        />
        <Stat
          label={`Collected in ${periodLabel(period)}`}
          value={formatTaka(collected)}
          tone="paid"
          hint={`${confirmedThisMonth.length} confirmed payments`}
        />
        <Stat label="Flats you cover" value={String(flatIds.length)} />
      </div>

      <div className="mt-10">
        <Tabs
          items={[
            {
              id: 'queue',
              label: `To confirm${pending.length ? ` (${pending.length})` : ''}`,
              content: <ReviewQueue payments={pending} />,
            },
            {
              id: 'history',
              label: 'History',
              content: <PaymentHistory payments={history} showWho />,
            },
          ]}
        />
      </div>
    </>
  )
}
