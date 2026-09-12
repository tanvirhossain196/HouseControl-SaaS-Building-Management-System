import Link from 'next/link'

import { getResidentOverview } from '@/services/overview.service'
import { daysUntil } from '@/services/dues.service'
import { dueLabel, formatTaka } from '@/lib/utils'

import {
  EmptyState,
  PageHeader,
} from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Stat } from './stat'

export async function ResidentDashboard({
  userId,
  name,
}: {
  userId: string
  name: string
}) {
  const stats = await getResidentOverview(userId)

  const days = stats.nextDue
    ? daysUntil(stats.nextDue.due_date)
    : null

  return (
    <>
      <PageHeader
        title={`Hello, ${name}.`}
        description="Your rent, dues, payments and flat information."
      />

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Your rent share"
          value={formatTaka(stats.rentShare)}
          hint="Monthly assigned rent"
          tone="neutral"
        />

        <Stat
          label="You owe"
          value={formatTaka(stats.outstanding)}
          tone={
            stats.outstanding > 0
              ? days !== null && days < 0
                ? 'overdue'
                : 'due'
              : 'paid'
          }
          hint={
            stats.nextDue && days !== null
              ? dueLabel(days)
              : 'Nothing outstanding'
          }
        />

        <Stat
          label="Open dues"
          value={String(stats.openDues.length)}
          hint="Rent, bills and shares"
        />

        <Stat
          label="Recent payments"
          value={String(stats.recentPayments.length)}
          hint="Your latest payments"
        />
      </div>

      {/* Quick actions */}
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/payments"
          className={buttonVariants({
            variant: 'primary',
            size: 'sm',
          })}
        >
          Make a payment
        </Link>

        <Link
          href="/dues"
          className={buttonVariants({
            variant: 'outline',
            size: 'sm',
          })}
        >
          View all dues
        </Link>

        <Link
          href="/flats"
          className={buttonVariants({
            variant: 'outline',
            size: 'sm',
          })}
        >
          View my flat
        </Link>
      </div>

      {/* Flat information */}
      <section className="mt-10">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-title text-ink">My flat</h2>
            <p className="mt-1 text-sm text-muted">
              Your current flat and rent information.
            </p>
          </div>

          <Link
            href="/flats"
            className="text-sm font-medium text-primary hover:underline"
          >
            Open My Flat
          </Link>
        </div>

        {!stats.flat ? (
          <div className="mt-4">
            <EmptyState
              title="Flat information unavailable"
              body="Your account is not currently attached to an active flat."
            />
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-panel border border-line bg-surface p-5">
              <p className="text-sm text-muted">Flat</p>
              <p className="mt-2 text-2xl font-semibold text-ink">
                {stats.flat.unitNumber}
              </p>
              <p className="mt-1 text-sm text-muted">
                {stats.flat.buildingName}
              </p>
            </div>

            <div className="rounded-panel border border-line bg-surface p-5">
              <p className="text-sm text-muted">Total flat rent</p>
              <p className="mt-2 text-2xl font-semibold text-ink">
                {formatTaka(stats.flat.monthlyRent)}
              </p>
              <p className="mt-1 text-sm text-muted">Monthly rent</p>
            </div>

            <div className="rounded-panel border border-line bg-surface p-5">
              <p className="text-sm text-muted">Your share</p>
              <p className="mt-2 text-2xl font-semibold text-primary">
                {formatTaka(stats.rentShare)}
              </p>
              <p className="mt-1 text-sm text-muted">
                Your monthly responsibility
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Moderator and active residents */}
      <section className="mt-10">
        <div>
          <h2 className="text-title text-ink">Flat residents</h2>
          <p className="mt-1 text-sm text-muted">
            Moderator and active residents of your flat.
          </p>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-panel border border-line bg-surface p-5">
            <p className="text-sm font-medium text-muted">Moderator</p>

            {stats.moderator ? (
              <div className="mt-4 flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-ink">
                    {stats.moderator.name}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {stats.moderator.email || 'Email unavailable'}
                  </p>
                </div>

                <div className="text-right">
                  <Badge tone="primary">Moderator</Badge>
                  <p className="mt-2 text-sm font-medium text-ink">
                    {formatTaka(stats.moderator.rentShare)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted">
                No moderator information available.
              </p>
            )}
          </div>

          <div className="rounded-panel border border-line bg-surface p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-muted">
                Active residents
              </p>

              <Badge tone="neutral">
                {stats.activeResidents.length}
              </Badge>
            </div>

            {stats.activeResidents.length === 0 ? (
              <p className="mt-4 text-sm text-muted">
                No active residents found.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-line">
                {stats.activeResidents.map((resident) => (
                  <li
                    key={resident.id}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">
                        {resident.name}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {resident.email || 'Email unavailable'}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-xs capitalize text-muted">
                        {resident.role}
                      </p>
                      <p className="mt-1 text-sm font-medium text-ink">
                        {formatTaka(resident.rentShare)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* Notifications */}
      <section className="mt-10">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-title text-ink">Notifications</h2>
            <p className="mt-1 text-sm text-muted">
              Your latest unread notifications.
            </p>
          </div>

          <Link
            href="/settings/notifications"
            className="text-sm font-medium text-primary hover:underline"
          >
            View all
          </Link>
        </div>

        <div className="mt-4">
          {stats.notifications.length === 0 ? (
            <div className="rounded-panel border border-line bg-surface p-5">
              <p className="text-sm text-muted">
                You have no unread notifications.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-line rounded-panel border border-line bg-surface">
              {stats.notifications.map((notification) => {
                const href =
                  notification.link ?? '/settings/notifications'

                return (
                  <li key={notification.id}>
                    <Link
                      href={href}
                      className="block px-4 py-4 transition-colors hover:bg-raised"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium text-ink">
                            {notification.title}
                          </p>

                          {notification.body && (
                            <p className="mt-1 text-sm text-muted">
                              {notification.body}
                            </p>
                          )}

                          <p className="mt-2 text-xs text-muted">
                            {new Date(
                              notification.created_at,
                            ).toLocaleDateString('en-BD')}
                          </p>
                        </div>

                        <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" />
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>

      {/* Dues */}
      <section className="mt-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-title text-ink">What you owe</h2>
            <p className="mt-1 text-sm text-muted">
              Your unpaid rent and other assigned dues.
            </p>
          </div>

          <Link
            href="/dues"
            className="text-sm font-medium text-primary hover:underline"
          >
            View all
          </Link>
        </div>

        <div className="mt-4">
          {stats.openDues.length === 0 ? (
            <EmptyState
              title="Nothing due"
              body="When your moderator bills the month's rent or your share of a bill, it will appear here with the payment date."
              action={
                <Link
                  href="/payments"
                  className={buttonVariants({
                    variant: 'outline',
                    size: 'sm',
                  })}
                >
                  View payment history
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-line rounded-panel border border-line bg-surface">
              {stats.openDues.map((due) => {
                const remaining =
                  Number(due.amount) - Number(due.amount_paid)

                const left = daysUntil(due.due_date)

                return (
                  <li
                    key={due.id}
                    className="flex flex-wrap items-center justify-between gap-4 px-4 py-4"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">
                        {due.description ??
                          `${due.source} · ${due.period.slice(0, 7)}`}
                      </p>

                      <p className="mt-1 tabular font-mono text-xs text-muted">
                        {formatTaka(remaining)} remaining of{' '}
                        {formatTaka(Number(due.amount))}
                      </p>

                      <p className="mt-1 text-xs text-muted">
                        Due date:{' '}
                        {new Date(due.due_date).toLocaleDateString('en-BD')}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <Badge
                        tone={
                          left < 0
                            ? 'overdue'
                            : left <= 3
                              ? 'due'
                              : 'neutral'
                        }
                        dot
                      >
                        {dueLabel(left)}
                      </Badge>

                      <Link
                        href={`/payments?dueId=${due.id}`}
                        className={buttonVariants({
                          variant: 'outline',
                          size: 'sm',
                        })}
                      >
                        Pay now
                      </Link>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>

      {/* Payment activity */}
      <section className="mt-10">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-title text-ink">Payment activity</h2>
            <p className="mt-1 text-sm text-muted">
              Payments made from your account.
            </p>
          </div>

          <Link
            href="/payments"
            className="text-sm font-medium text-primary hover:underline"
          >
            Open payments
          </Link>
        </div>

        <div className="mt-4 rounded-panel border border-line bg-surface p-5">
          {stats.recentPayments.length === 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-sm text-muted">
                No payments have been recorded yet.
              </p>

              <Link
                href="/payments"
                className={buttonVariants({
                  variant: 'primary',
                  size: 'sm',
                })}
              >
                Make a payment
              </Link>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-ink">
                  {stats.recentPayments.length} recent payment
                  {stats.recentPayments.length === 1 ? '' : 's'}
                </p>

                <p className="mt-1 text-sm text-muted">
                  View your complete payment history and receipts.
                </p>
              </div>

              <Link
                href="/payments"
                className={buttonVariants({
                  variant: 'outline',
                  size: 'sm',
                })}
              >
                View history
              </Link>
            </div>
          )}
        </div>
      </section>
    </>
  )
}