import Link from 'next/link'

import { pageMetadata } from '@/lib/seo'
import { requireSession } from '@/lib/auth/session'
import { getMyFlat } from '@/services/my-flat.service'
import { formatTaka } from '@/lib/utils'

import {
  EmptyState,
  PageHeader,
} from '@/components/layout/page-header'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'

export const metadata = pageMetadata({
  title: 'My Flat',
  description: 'View your flat information, residents and rent details.',
  path: '/flats',
  noIndex: true,
})

function paymentTone(status: string) {
  if (status === 'paid') return 'paid' as const
  if (status === 'partial') return 'due' as const
  if (status === 'due') return 'overdue' as const
  return 'neutral' as const
}

function paymentLabel(status: string) {
  if (status === 'paid') return 'Paid'
  if (status === 'partial') return 'Partially paid'
  if (status === 'due') return 'Due'
  return 'No dues'
}

function formatPhone(phone: string | null) {
  return phone ?? 'Phone hidden'
}

export default async function MyFlatPage() {
  const session = await requireSession('/flats')
  const flats = await getMyFlat(session.userId)

  return (
    <>
      <PageHeader
        title="My Flat"
        description="Your flat, rent share, residents and payment information."
        actions={
          session.isOrgAdmin ? (
            <Link
              href="/admin/flats"
              className={buttonVariants({
                variant: 'outline',
              })}
            >
              Manage All Flats
            </Link>
          ) : undefined
        }
      />

      {flats.length === 0 ? (
        <EmptyState
          title="No flat assigned"
          body="Your flat will appear here after accepting an invitation from an owner or moderator."
        />
      ) : (
        <div className="space-y-8">
          {flats.map((flat) => {
            const currentMember = flat.members.find(
              (member) => member.userId === session.userId,
            )

            const isModerator = flat.role === 'moderator'

            const otherMembers = flat.members.filter(
              (member) => member.userId !== session.userId,
            )

            return (
              <section
                key={flat.id}
                className="overflow-hidden rounded-panel border border-line bg-surface shadow-sm"
              >
                <div className="border-b border-line bg-gradient-to-r from-primary-soft/60 to-surface p-5 sm:p-6">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                          My Flat
                        </span>

                        <Badge
                          tone={isModerator ? 'primary' : 'neutral'}
                        >
                          {isModerator ? 'Moderator' : 'Resident'}
                        </Badge>
                      </div>

                      <h1 className="mt-2 font-mono text-3xl font-bold text-ink">
                        Flat {flat.unit_number}
                      </h1>

                      <p className="mt-2 text-sm text-muted">
                        {flat.building?.name ?? 'Building unavailable'}
                        {flat.building?.area
                          ? ` · ${flat.building.area}`
                          : ''}
                        {flat.floor !== null
                          ? ` · Floor ${flat.floor}`
                          : ''}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/flats/${flat.id}`}
                        className={buttonVariants({
                          variant: 'outline',
                          size: 'sm',
                        })}
                      >
                        View details
                      </Link>

                      {isModerator && (
                        <Link
                          href={`/flats/${flat.id}#manage-residents`}
                          className={buttonVariants({
                            variant: 'primary',
                            size: 'sm',
                          })}
                        >
                          Manage flat
                        </Link>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-6 p-5 sm:p-6">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-control border border-line bg-raised p-4">
                      <p className="text-xs text-muted">Total monthly rent</p>
                      <p className="mt-2 font-mono text-xl font-bold text-ink">
                        {formatTaka(flat.monthly_rent)}
                      </p>
                    </div>

                    <div className="rounded-control border border-line bg-raised p-4">
                      <p className="text-xs text-muted">Your rent share</p>
                      <p className="mt-2 font-mono text-xl font-bold text-primary">
                        {formatTaka(flat.ownRentShare)}
                      </p>
                    </div>

                    <div className="rounded-control border border-line bg-raised p-4">
                      <p className="text-xs text-muted">Rent due day</p>
                      <p className="mt-2 text-xl font-bold text-ink">
                        {flat.rent_due_day}
                        <span className="ml-1 text-sm font-normal text-muted">
                          of every month
                        </span>
                      </p>
                    </div>

                    <div className="rounded-control border border-line bg-raised p-4">
                      <p className="text-xs text-muted">Active residents</p>
                      <p className="mt-2 text-xl font-bold text-ink">
                        {flat.activeResidents.length}
                      </p>
                    </div>
                  </div>

                  {currentMember && (
                    <div className="rounded-panel border border-primary/20 bg-primary-soft/40 p-4">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                            Your payment overview
                          </p>

                          <p className="mt-1 text-sm text-muted">
                            {currentMember.dueDate
                              ? `Due date: ${new Date(
                                  currentMember.dueDate,
                                ).toLocaleDateString('en-BD')}`
                              : 'No payment due recorded'}
                          </p>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="font-mono text-lg font-bold text-ink">
                              {formatTaka(currentMember.outstanding)}
                            </p>
                            <p className="text-xs text-muted">Outstanding</p>
                          </div>

                          <Badge
                            tone={paymentTone(
                              currentMember.paymentStatus,
                            )}
                          >
                            {paymentLabel(currentMember.paymentStatus)}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
                    <div className="rounded-panel border border-line p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                            Moderator
                          </p>

                          <h2 className="mt-1 text-lg font-semibold text-ink">
                            {flat.moderator?.name ?? 'No moderator assigned'}
                          </h2>
                        </div>

                        {flat.moderator && (
                          <Badge tone="primary">Moderator</Badge>
                        )}
                      </div>

                      {flat.moderator ? (
                        <div className="mt-4 space-y-3 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted">Phone</span>
                            <span className="font-medium text-ink">
                              {formatPhone(flat.moderator.phone)}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted">Rent share</span>
                            <span className="font-mono font-medium text-ink">
                              {formatTaka(flat.moderator.rentShare)}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted">Payment</span>
                            <Badge
                              tone={paymentTone(
                                flat.moderator.paymentStatus,
                              )}
                            >
                              {paymentLabel(
                                flat.moderator.paymentStatus,
                              )}
                            </Badge>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-4 text-sm text-muted">
                          Moderator information is not available.
                        </p>
                      )}
                    </div>

                    <div className="rounded-panel border border-line p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                            Residents and rent split
                          </p>

                          <h2 className="mt-1 text-lg font-semibold text-ink">
                            {otherMembers.length > 0
                              ? `${otherMembers.length} other resident${
                                  otherMembers.length === 1 ? '' : 's'
                                }`
                              : 'No other resident'}
                          </h2>
                        </div>

                        <Badge tone="neutral">
                          {flat.members.length} total
                        </Badge>
                      </div>

                      {otherMembers.length === 0 ? (
                        <p className="mt-4 text-sm text-muted">
                          No other active resident is assigned to this flat.
                        </p>
                      ) : (
                        <div className="mt-4 divide-y divide-line">
                          {otherMembers.map((member) => (
                            <div
                              key={member.id}
                              className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="truncate font-medium text-ink">
                                    {member.name}
                                  </p>

                                  <Badge
                                    tone={
                                      member.status === 'active'
                                        ? 'paid'
                                        : 'due'
                                    }
                                  >
                                    {member.status === 'active'
                                      ? 'Active'
                                      : 'Inactive'}
                                  </Badge>
                                </div>

                                <div className="mt-1 space-y-1 text-xs text-muted">
                                  <p>
                                    Room: {member.roomNumber}
                                  </p>
                                  <p>
                                    Phone: {formatPhone(member.phone)}
                                  </p>
                                  {member.dueDate && (
                                    <p>
                                      Due:{' '}
                                      {new Date(
                                        member.dueDate,
                                      ).toLocaleDateString('en-BD')}
                                    </p>
                                  )}
                                </div>
                              </div>

                              <div className="flex shrink-0 items-center gap-3">
                                <div className="text-right">
                                  <p className="font-mono font-semibold text-ink">
                                    {formatTaka(member.rentShare)}
                                  </p>
                                  <p className="text-xs text-muted">
                                    Rent share
                                  </p>
                                </div>

                                <Badge
                                  tone={paymentTone(
                                    member.paymentStatus,
                                  )}
                                >
                                  {paymentLabel(
                                    member.paymentStatus,
                                  )}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {isModerator && (
                    <div className="flex flex-col gap-3 rounded-control border border-dashed border-primary/30 bg-primary-soft/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-medium text-ink">
                          Moderator controls
                        </p>

                        <p className="mt-1 text-sm text-muted">
                          Manage rent split, residents, invitations and member
                          visibility from the flat details page.
                        </p>
                      </div>

                      <Link
                        href={`/flats/${flat.id}#manage-residents`}
                        className={buttonVariants({
                          variant: 'outline',
                          size: 'sm',
                        })}
                      >
                        Open management
                      </Link>
                    </div>
                  )}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}