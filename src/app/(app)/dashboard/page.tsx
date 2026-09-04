import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'
import { pageMetadata } from '@/lib/seo'
import { displayName, requireSession } from '@/lib/auth/session'
import { defaultOrgId, sessionRole } from '@/lib/auth/guards'
import { OwnerDashboard } from '@/components/dashboard/owner-dashboard'
import { ModeratorDashboard } from '@/components/dashboard/moderator-dashboard'
import { ResidentDashboard } from '@/components/dashboard/resident-dashboard'
import { listIncomingTransfers } from '@/services/transfers.service'
import { IncomingTransfer } from '@/components/transfers/incoming-transfer'
import { PageHeader, EmptyState } from '@/components/layout/page-header'
import { buttonVariants } from '@/components/ui/button'

export const metadata = pageMetadata({
  title: 'Dashboard',
  description: 'Your buildings, dues and requests.',
  path: '/dashboard',
  noIndex: true,
})

/**
 * One route, four screens. The role decides which one renders, so a shared
 * link always opens the version the person is allowed to see.
 */
export default async function DashboardPage() {
  const session = await requireSession()
  const role = sessionRole(session)
  const name = displayName(session).split(' ')[0] ?? 'there'

  if (role === 'guard') redirect('/gate')

  // An offer that sits unnoticed for 48 hours helps nobody, so it leads.
  const incoming = await listIncomingTransfers(session.userId).catch(() => [])

  return (
    <>
      {incoming.map((transfer) => (
        <IncomingTransfer key={transfer.id} transfer={transfer} />
      ))}

      {!session.isPhoneVerified && role !== 'resident' && (
        <div className="mb-8 flex flex-col gap-4 rounded-panel border border-due/30 bg-due-soft p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-due" aria-hidden />
            <div>
              <p className="font-medium text-ink">Verify your mobile number</p>
              <p className="mt-1 max-w-[54ch] text-sm text-muted">
                Role handovers are confirmed by SMS, so a moderator without a verified
                number cannot hand the role on.
              </p>
            </div>
          </div>
          <Link
            href="/onboarding/phone"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Verify number
          </Link>
        </div>
      )}

      {role === 'admin' || role === 'super_admin' ? (
        <OwnerDashboard orgId={defaultOrgId(session)} name={name} />
      ) : role === 'moderator' ? (
        <ModeratorDashboard
          flatIds={session.memberships.flats
            .filter((f) => f.role === 'moderator')
            .map((f) => f.flatId)}
          name={name}
        />
      ) : session.memberships.flats.length > 0 ? (
        <ResidentDashboard userId={session.userId} name={name} />
      ) : (
        <>
          <PageHeader
            title={`Welcome, ${name}.`}
            description="Your account is ready. It is not attached to a building yet."
          />
          <EmptyState
            title="No building yet"
            body="An owner or a flat moderator invites you by email. Open the invite link and this dashboard fills up with your flat, your dues and your gate log."
            action={
              <Link href="/onboarding/building" className={buttonVariants()}>
                I am the owner — set up my building
              </Link>
            }
          />
        </>
      )}
    </>
  )
}
