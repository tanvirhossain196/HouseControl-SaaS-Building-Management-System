import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, UserPlus, Settings2 } from 'lucide-react'

import { pageMetadata } from '@/lib/seo'
import { requireFlatPermission, flatScope, sessionCan } from '@/lib/auth/guards'
import { createServerSupabase } from '@/lib/supabase/server'

import { getFlat, getFlatRentSummary } from '@/services/flats.service'
import { getBuilding } from '@/services/buildings.service'
import { listResidents } from '@/services/residents.service'
import { listFlatDues } from '@/services/dues.service'
import { listPaymentsForFlats } from '@/services/payments.service'
import { getPendingTransfer, listTransfers } from '@/services/transfers.service'

import { formatTaka } from '@/lib/utils'

import { PageHeader, EmptyState } from '@/components/layout/page-header'

import { Stat } from '@/components/dashboard/stat'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

import { BillMonth } from '@/components/money/bill-month'
import { RentScheduleForm } from '@/components/money/rent-schedule-form'
import { listReviewScope } from '@/lib/auth/reviewable'
import { DueList } from '@/components/money/due-list'
import { PaymentHistory } from '@/components/money/payment-history'

import { TransferHistory } from '@/components/transfers/transfer-history'
import { InviteResident } from '@/components/residents/invite-resident'
import { ResidentList } from '@/components/residents/resident-list'
import { RentSplitEditor } from '@/components/residents/rent-split-editor'
import { FlatVisibilitySettings } from '@/components/residents/flat-visibility-settings'

export const metadata = pageMetadata({
  title: 'Flat details',
  description: 'Residents, rent split and payment details for one flat.',
  path: '/flats',
  noIndex: true,
})

type VisibilitySettingsRow = {
  flat_id: string
  show_member_phone: boolean
  show_member_rent: boolean
  show_payment_status: boolean
  show_due_date: boolean
  show_member_list: boolean
  show_moderator_phone: boolean
}

const defaultVisibilitySettings = {
  showMemberPhone: true,
  showMemberRent: true,
  showPaymentStatus: true,
  showDueDate: true,
  showMemberList: true,
  showModeratorPhone: true,
}

export default async function FlatPage({ params }: { params: { id: string } }) {
  const resolvedParams = await params

  const flat = await getFlat(resolvedParams.id).catch(() => null)

  if (!flat) {
    notFound()
  }

  const session = await requireFlatPermission(flat.id, 'report.flat.view')

  const scope = await flatScope(flat.id)
  const supabase = createServerSupabase()

  const [
    building,
    residents,
    dues,
    payments,
    transfers,
    pendingTransfer,
    rentSummary,
    visibilityResult,
  ] = await Promise.all([
    getBuilding(flat.building_id).catch(() => null),
    listResidents(flat.id).catch(() => []),
    listFlatDues(flat.id).catch(() => []),
    listPaymentsForFlats([flat.id], 25).catch(() => []),
    listTransfers(flat.id).catch(() => []),
    getPendingTransfer(flat.id).catch(() => null),
    getFlatRentSummary(flat.id).catch(() => null),
    supabase
      .from('flat_visibility_settings')
      .select(
        `
          flat_id,
          show_member_phone,
          show_member_rent,
          show_payment_status,
          show_due_date,
          show_member_list,
          show_moderator_phone
        `,
      )
      .eq('flat_id', flat.id)
      .maybeSingle(),
  ])

  const canManage = sessionCan(session, 'resident.remove', scope)

  /**
   * Flats somebody could be moved into.
   *
   * The same scope the payment queues use — the buildings and flats this person
   * is responsible for — minus the flat they are already in. Empty for anyone
   * who runs a single flat, and the menu entry disappears with it rather than
   * opening a picker with nothing in it.
   */
  const transferTargets = canManage
    ? (await listReviewScope(session).catch(() => []))
        .flatMap((building) =>
          building.flats.map((entry) => ({
            id: entry.id,
            label: `${building.name} · Flat ${entry.unitNumber}`,
          })),
        )
        .filter((entry) => entry.id !== flat.id)
    : []

  const canAssignShares = sessionCan(session, 'rent.assign', scope)

  const canAssignModerator = sessionCan(session, 'flat.assign_moderator', scope)

  const canInvite = sessionCan(session, 'resident.invite', scope)

  const canBill = sessionCan(session, 'due.manage', scope)

  const canRollback = sessionCan(session, 'flat.assign_moderator', scope)

  const isModeratorHere = residents.some(
    (resident) => resident.userId === session.userId && resident.role === 'moderator',
  )

  const activeAssigned = residents.reduce(
    (sum, resident) => sum + Number(resident.rentShare),
    0,
  )

  const totalAllocated = rentSummary ? rentSummary.allocatedRent : activeAssigned

  const remainingRent = rentSummary
    ? rentSummary.remainingRent
    : Math.max(0, Number(flat.monthly_rent) - activeAssigned)

  const moderator = residents.find((resident) => resident.role === 'moderator')

  const activeResidents = residents

  const outstanding = residents.reduce(
    (sum, resident) => sum + Number(resident.outstanding),
    0,
  )

  const visibilityRow = visibilityResult.data as VisibilitySettingsRow | null

  const visibility = visibilityRow
    ? {
        showMemberPhone: visibilityRow.show_member_phone,
        showMemberRent: visibilityRow.show_member_rent,
        showPaymentStatus: visibilityRow.show_payment_status,
        showDueDate: visibilityRow.show_due_date,
        showMemberList: visibilityRow.show_member_list,
        showModeratorPhone: visibilityRow.show_moderator_phone,
      }
    : defaultVisibilitySettings

  return (
    <>
      {building && (
        <Link
          href={`/admin/buildings/${building.id}`}
          className="mb-6 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
        >
          <ChevronLeft className="size-4" />
          {building.name}
        </Link>
      )}

      <PageHeader
        title={`Flat ${flat.unit_number}`}
        description={`Floor ${flat.floor} · ${formatTaka(
          Number(flat.monthly_rent),
        )} per month · Due on the ${flat.rent_due_day}${
          building ? ` · ${building.name}` : ''
        }`}
        actions={
          <div className="flex flex-wrap gap-2">
            {canBill && (
              <>
                <BillMonth scope="flat" id={flat.id} label={`flat ${flat.unit_number}`} />

                <RentScheduleForm
                  flatId={flat.id}
                  currentDay={flat.rent_due_day}
                  unitNumber={flat.unit_number}
                />
              </>
            )}

            {canInvite && (
              <InviteResident
                flatId={flat.id}
                unassigned={remainingRent}
                trigger={
                  <Button variant="outline">
                    <UserPlus className="size-4" />
                    Invite resident
                  </Button>
                }
              />
            )}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <Stat
          label="Total rent"
          value={formatTaka(Number(flat.monthly_rent))}
          hint="Monthly flat rent"
        />

        <Stat
          label="Residents"
          value={String(activeResidents.length)}
          hint={`${residents.length} total records`}
        />

        <Stat
          label="Allocated"
          value={formatTaka(totalAllocated)}
          tone={totalAllocated <= Number(flat.monthly_rent) ? 'paid' : 'overdue'}
          hint={
            totalAllocated === Number(flat.monthly_rent)
              ? 'Shares fully allocated'
              : `${formatTaka(remainingRent)} available`
          }
        />

        <Stat
          label="Remaining"
          value={formatTaka(remainingRent)}
          tone={remainingRent > 0 ? 'due' : 'paid'}
          hint="Rent available to assign"
        />

        <Stat
          label="Outstanding"
          value={formatTaka(outstanding)}
          tone={outstanding > 0 ? 'overdue' : 'paid'}
          hint="Total unpaid amount"
        />

        <Stat
          label="Moderator"
          value={moderator ? formatTaka(Number(moderator.rentShare)) : '—'}
          hint={moderator?.fullName ?? 'No moderator assigned'}
        />
      </div>

      {isModeratorHere && (
        <section
          id="manage-residents"
          className="mt-8 rounded-panel border border-primary/20 bg-primary-soft/30 p-5"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Settings2 className="mt-0.5 size-5 shrink-0 text-primary" />

              <div>
                <h2 className="font-semibold text-ink">Moderator controls</h2>

                <p className="mt-1 text-sm text-muted">
                  Manage residents, rent shares, invitations and payment records for this
                  flat.
                </p>
              </div>
            </div>

            <Badge tone="primary">Moderator access</Badge>
          </div>
        </section>
      )}

      {canManage && (
        <section className="mt-8">
          <FlatVisibilitySettings flatId={flat.id} initialSettings={visibility} />
        </section>
      )}

      <section className="mt-10">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-title text-ink">Residents and rent split</h2>

            <p className="mt-1 max-w-[65ch] text-sm text-muted">
              Each resident has an individual rent share, payment status and membership
              status.
            </p>
          </div>

          {canManage && (
            <span className="text-xs text-muted">
              You can deactivate or remove residents below.
            </span>
          )}
        </div>

        <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div>
            {residents.length === 0 ? (
              <EmptyState
                title="Nobody lives here yet"
                body="Invite the flat's moderator first. They can then invite other residents and assign rent shares."
                action={
                  canInvite ? (
                    <InviteResident
                      flatId={flat.id}
                      unassigned={remainingRent}
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
                transferTargets={transferTargets}
              />
            )}
          </div>

          <div>
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
        <h2 className="text-title text-ink">Moderator history</h2>

        <p className="mt-1 max-w-[65ch] text-sm text-muted">
          Moderator handover records are kept for security and audit purposes.
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
        <h2 className="text-title text-ink">Flat ledger</h2>

        <p className="mt-1 max-w-[65ch] text-sm text-muted">
          All dues and payments recorded for this flat.
        </p>

        <div className="mt-4 space-y-6">
          <DueList dues={dues} payable={false} />

          <PaymentHistory payments={payments} showWho />
        </div>
      </section>

      {pendingTransfer && (
        <section className="mt-10 rounded-panel border border-line bg-surface p-5">
          <h2 className="font-semibold text-ink">Pending moderator transfer</h2>

          <p className="mt-1 text-sm text-muted">
            A moderator handover is currently waiting for confirmation.
          </p>
        </section>
      )}
    </>
  )
}
