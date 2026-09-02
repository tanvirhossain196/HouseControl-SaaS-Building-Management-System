import Link from 'next/link'
import { getOwnerOverview } from '@/services/overview.service'
import { formatTaka } from '@/lib/utils'
import { PageHeader } from '@/components/layout/page-header'
import { buttonVariants } from '@/components/ui/button'
import { CollectionMeter, Stat } from './stat'

/** What an owner opens the app to find out: how much is still outstanding. */
export async function OwnerDashboard({
  orgId,
  name,
}: {
  orgId: string | null
  name: string
}) {
  const stats = await getOwnerOverview(orgId)
  const outstanding = stats.billed - stats.collected

  return (
    <>
      <PageHeader
        title={`Good to see you, ${name}.`}
        description="Every building you own, this month at a glance."
        actions={
          <>
            <Link href="/admin" className={buttonVariants({ variant: 'outline' })}>
              Manage buildings
            </Link>
            <Link href="/admin/team" className={buttonVariants()}>
              Invite someone
            </Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Outstanding this month"
          value={formatTaka(outstanding)}
          tone={outstanding > 0 ? 'due' : 'paid'}
          hint={`${formatTaka(stats.collected)} collected of ${formatTaka(stats.billed)} billed`}
        />
        <Stat
          label="Overdue"
          value={String(stats.overdueCount)}
          tone={stats.overdueCount > 0 ? 'overdue' : 'paid'}
          hint={
            stats.overdueCount ? 'Past the rent day, unpaid' : 'Nothing past its date'
          }
        />
        <Stat
          label="Payments to confirm"
          value={String(stats.pendingPayments)}
          hint="Residents have sent these; a moderator has not confirmed them"
        />
        <Stat
          label="Open repairs"
          value={String(stats.openRequests)}
          hint="Reported and not yet resolved"
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CollectionMeter collected={stats.collected} billed={stats.billed} />
        <Stat label="Buildings" value={String(stats.buildings)} />
        <Stat
          label="Units"
          value={String(stats.flats)}
          hint={`${stats.occupied} occupied, ${stats.flats - stats.occupied} empty`}
        />
        <Stat
          label="Residents"
          value={String(stats.residents)}
          hint="Across every flat"
        />
      </div>
    </>
  )
}
