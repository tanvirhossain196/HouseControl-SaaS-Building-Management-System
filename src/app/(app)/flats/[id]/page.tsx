import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, UserPlus } from 'lucide-react'
import { pageMetadata } from '@/lib/seo'
import { requireFlatPermission, flatScope, sessionCan } from '@/lib/auth/guards'
import { getFlat } from '@/services/flats.service'
import { getBuilding } from '@/services/buildings.service'
import { listResidents } from '@/services/residents.service'
import { listFlatDues } from '@/services/dues.service'
import { listPaymentsForFlats } from '@/services/payments.service'
import { getPendingTransfer, listTransfers } from '@/services/transfers.service'
import { formatTaka } from '@/lib/utils'
import { PageHeader, EmptyState } from '@/components/layout/page-header'
import { Stat } from '@/components/dashboard/stat'
import { Button } from '@/components/ui/button'
import { BillMonth } from '@/components/money/bill-month'
import { DueList } from '@/components/money/due-list'
import { PaymentHistory } from '@/components/money/payment-history'
import { HandOverRole } from '@/components/transfers/hand-over-role'
import { TransferHistory } from '@/components/transfers/transfer-history'
import { InviteResident } from '@/components/residents/invite-resident'
import { ResidentList } from '@/components/residents/resident-list'
import { RentSplitEditor } from '@/components/residents/rent-split-editor'

export const metadata = pageMetadata({
  title: 'Flat',
  description: 'Residents and the rent split for one flat.',
  path: '/flats',
  noIndex: true,
})

/**
 * One flat, for the person who runs it — its moderator, or the owner of the
 * organization it sits in. Both arrive through the same permission check.
 */
export default async function FlatPage({ params }: { params: { id: string } }) {
  const flat = await getFlat(params.id).catch(() => null)
  if (!flat) notFound()

  const session = await requireFlatPermission(flat.id, 'report.flat.view')
  const scope = await flatScope(flat.id)

  const [building, residents, dues, payments, transfers, pendingTransfer] =
    await Promise.all([
      getBuilding(flat.building_id).catch(() => null),
      listResidents(flat.id).catch(() => []),
      listFlatDues(flat.id).catch(() => []),
      listPaymentsForFlats([flat.id], 25).catch(() => []),
      listTransfers(flat.id).catch(() => []),
      getPendingTransfer(flat.id).catch(() => null),
    ])

  const canManage = sessionCan(session, 'resident.remove', scope)
  const canAssignShares = sessionCan(session, 'rent.assign', scope)
  const canAssignModerator = sessionCan(session, 'flat.assign_moderator', scope)
  const canInvite = sessionCan(session, 'resident.invite', scope)
  const canBill = sessionCan(session, 'due.manage', scope)
  const canRollback = sessionCan(session, 'flat.assign_moderator', scope)
  // Handing the role on is personal: only whoever currently holds it.
  const isModeratorHere = residents.some(
    (resident) => resident.userId === session.userId && resident.role === 'moderator',
  )

  const assigned = residents.reduce((sum, resident) => sum + resident.rentShare, 0)
  const outstanding = residents.reduce((sum, resident) => sum + resident.outstanding, 0)

  return (
    <>
      {building && (
        <Link
          href={`/admin/buildings/${building.id}`}
          className="mb-6 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
        >
          <ChevronLeft className="size-4" /> {building.name}
        </Link>
      )}

      <PageHeader
        title={`Flat ${flat.unit_number}`}
        description={`Floor ${flat.floor} · ${formatTaka(Number(flat.monthly_rent))} a month, due on the ${flat.rent_due_day}${building ? ` · ${building.name}` : ''}`}
        actions={
          <>
            {canBill && (
              <BillMonth scope="flat" id={flat.id} label={`flat ${flat.unit_number}`} />
            )}
            {canInvite ? (
              <InviteResident
                flatId={flat.id}
                unassigned={Number(flat.monthly_rent) - assigned}
                trigger={
                  <Button variant="outline">
                    <UserPlus /> Invite a resident
                  </Button>
                }
              />
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Residents" value={String(residents.length)} />
        <Stat
          label="Rent assigned"
          value={formatTaka(assigned)}
          tone={assigned === Number(flat.monthly_rent) ? 'paid' : 'due'}
          hint={
            assigned === Number(flat.monthly_rent)
              ? 'Shares add up to the flat rent'
              : `${formatTaka(Math.abs(Number(flat.monthly_rent) - assigned))} unassigned`
          }
        />
        <Stat
          label="Outstanding"
          value={formatTaka(outstanding)}
          tone={outstanding > 0 ? 'overdue' : 'paid'}
        />
        <Stat
          label="Moderator"
          value={residents.some((resident) => resident.role === 'moderator') ? '1' : '0'}
          hint={
            residents.find((resident) => resident.role === 'moderator')?.fullName ??
            'Nobody runs this flat yet'
          }
        />
      </div>

      <section className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div>
          <h2 className="text-title text-ink">Residents</h2>
          <div className="mt-4">
            {residents.length === 0 ? (
              <EmptyState
                title="Nobody lives here yet"
                body="Invite the flat's moderator first. They can then invite the people sharing the flat with them, and split the rent between everyone."
                action={
                  canInvite ? (
                    <InviteResident
                      flatId={flat.id}
                      unassigned={Number(flat.monthly_rent)}
                      trigger={<Button>Send an invite</Button>}
                    />
                  ) : undefined
                }
              />
            ) : (
              <ResidentList
                flatId={flat.id}
                residents={residents}
                canManage={canManage}
                canAssignModerator={canAssignModerator}
              />
            )}
          </div>
        </div>

        <div>
          <h2 className="text-title text-ink lg:sr-only">Rent</h2>
          <div className="mt-4 lg:mt-0">
            <RentSplitEditor
              flatId={flat.id}
              monthlyRent={Number(flat.monthly_rent)}
              residents={residents}
              canEdit={canAssignShares}
            />
          </div>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-title text-ink">Who has run this flat</h2>
        <p className="mt-1 max-w-[62ch] text-sm text-muted">
          A handover needs a code from the outgoing moderator and consent from the
          incoming one. The owner can undo an accepted handover for seven days.
        </p>
        <div className="mt-4">
          <TransferHistory
            transfers={transfers}
            flatId={flat.id}
            canRollback={canRollback}
          />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-title text-ink">Ledger</h2>
        <p className="mt-1 max-w-[62ch] text-sm text-muted">
          Everything billed to this flat, and every payment recorded against it. Unpaid
          charges stay on the month they belong to rather than being rolled into the next
          one.
        </p>
        <div className="mt-4 space-y-6">
          <DueList dues={dues} payable={false} />
          <PaymentHistory payments={payments} showWho />
        </div>
      </section>
    </>
  )
}
