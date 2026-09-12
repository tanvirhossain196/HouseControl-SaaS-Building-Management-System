import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CreditCard, ShieldAlert } from 'lucide-react'

import { pageMetadata } from '@/lib/seo'
import { displayName, requireSession } from '@/lib/auth/session'
import { defaultOrgId, sessionRole } from '@/lib/auth/guards'

import { OwnerDashboard } from '@/components/dashboard/owner-dashboard'
import { ModeratorDashboard } from '@/components/dashboard/moderator-dashboard'
import { ResidentDashboard } from '@/components/dashboard/resident-dashboard'

import { listIncomingTransfers } from '@/services/transfers.service'
import { IncomingTransfer } from '@/components/transfers/incoming-transfer'

import { EmptyState, PageHeader } from '@/components/layout/page-header'
import { buttonVariants } from '@/components/ui/button'

export const metadata = pageMetadata({
  title: 'Dashboard',
  description: 'Your buildings, flats, payments and requests.',
  path: '/dashboard',
  noIndex: true,
})

export default async function DashboardPage() {
  const session = await requireSession()
  const role = sessionRole(session)

  const firstName = displayName(session).trim().split(/\s+/)[0] || 'there'

  if (role === 'guard') {
    redirect('/gate')
  }

  const incoming = await listIncomingTransfers(session.userId).catch(() => [])

  const canManageBilling = role === 'admin' || role === 'super_admin'

  return (
    <>
      {incoming.map((transfer) => (
        <IncomingTransfer key={transfer.id} transfer={transfer} />
      ))}

      {!session.isPhoneVerified && role !== 'resident' && (
        <div className="mb-8 flex flex-col gap-4 rounded-panel border border-due/30 bg-due-soft p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-due" aria-hidden="true" />

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
            className={buttonVariants({
              variant: 'outline',
              size: 'sm',
            })}
          >
            Verify number
          </Link>
        </div>
      )}

      {canManageBilling && (
        <div className="mb-8 flex flex-col gap-4 rounded-panel border border-primary/20 bg-primary-soft/30 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <CreditCard
              className="mt-0.5 size-5 shrink-0 text-primary"
              aria-hidden="true"
            />

            <div>
              <p className="font-medium text-ink">Plan and billing</p>

              <p className="mt-1 text-sm text-muted">
                View your current plan, unit limit and upgrade options.
              </p>
            </div>
          </div>

          <Link
            href="/settings/billing"
            className={buttonVariants({
              variant: 'outline',
              size: 'sm',
            })}
          >
            Manage billing
          </Link>
        </div>
      )}

      {role === 'admin' || role === 'super_admin' ? (
        <OwnerDashboard orgId={defaultOrgId(session)} name={firstName} />
      ) : role === 'moderator' ? (
        <ModeratorDashboard
          flatIds={session.memberships.flats
            .filter((flat) => flat.role === 'moderator')
            .map((flat) => flat.flatId)}
          name={firstName}
        />
      ) : session.memberships.flats.length > 0 ? (
        <ResidentDashboard userId={session.userId} name={firstName} />
      ) : (
        <>
          <PageHeader
            title={`Welcome, ${firstName}.`}
            description="Your account is ready, but it is not attached to a building yet."
          />

          <EmptyState
            title="No building yet"
            body="An owner or flat moderator can invite you by email. Open the invite link and your flat, dues and payment information will appear here."
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
