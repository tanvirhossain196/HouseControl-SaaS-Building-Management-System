import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { pageMetadata } from '@/lib/seo'
import { requireSession } from '@/lib/auth/session'
import { sessionRole } from '@/lib/auth/guards'
import { listControlBuildings, getControlSnapshot } from '@/services/control.service'
import { listPendingPayments } from '@/services/payments.service'
import {
  listBuildingRemittances,
  listPendingRemittancePayments,
} from '@/services/remittances.service'
import { periodLabel, periodOf } from '@/lib/billing'
import { formatTaka, cn } from '@/lib/utils'
import { PageHeader, EmptyState } from '@/components/layout/page-header'
import { ControlPanel } from '@/components/control/control-panel'
import { BillMonth } from '@/components/money/bill-month'
import { HandoverSchedule } from '@/components/money/handover-schedule'

export const metadata = pageMetadata({
  title: 'Control',
  description:
    'One building at a glance: who has paid, who has not, who came through the gate.',
  path: '/control',
  noIndex: true,
})

/**
 * The building at a glance, and the handful of things worth doing from here.
 *
 * The rule for what earns a place on this page: it is done often, and it is
 * decided by something visible on the screen. Billing the month, moving a rent
 * day, moving a moderator's deadline — all of those follow directly from what
 * the grid is showing. Everything rarer links out to the page that owns it, so
 * there is still exactly one place that edits each thing.
 *
 * The building is chosen through the query string rather than component state,
 * so the choice survives a refresh and can be linked to.
 */
export default async function ControlPage({
  searchParams,
}: {
  searchParams: { building?: string; month?: string }
}) {
  const session = await requireSession('/control')
  const role = sessionRole(session)
  const isOwner = role === 'admin' || role === 'super_admin'

  const buildings = await listControlBuildings().catch(() => [])

  /**
   * Pulled out rather than indexed later. With noUncheckedIndexedAccess on,
   * buildings[0] stays possibly-undefined however many length checks come
   * before it, and a non-null assertion would hide that from the reader as
   * well as from the compiler.
   */
  const [first] = buildings

  if (!first) {
    return (
      <>
        <PageHeader title="Control" description="One building at a glance." />

        <div className="mt-6">
          <EmptyState
            title="No building to show"
            body="Once you own or moderate a building, it appears here with every unit and how far the month has got."
          />
        </div>
      </>
    )
  }

  const requested = searchParams.building
  const selectedId =
    requested && buildings.some((building) => building.id === requested)
      ? requested
      : first.id

  const period = /^\d{4}-\d{2}-01$/.test(searchParams.month ?? '')
    ? (searchParams.month as string)
    : periodOf()

  const snapshot = await getControlSnapshot(selectedId, period)

  /**
   * Which flats this person may act on.
   *
   * An owner may act on everything in their building. A moderator only on the
   * flats they run — the server actions enforce that anyway, but a button that
   * always fails is worse than no button.
   */
  const moderated = new Set(
    session.memberships.flats
      .filter((flat) => flat.role === 'moderator')
      .map((flat) => flat.flatId),
  )

  const manageable = snapshot.flats
    .filter((flat) => isOwner || moderated.has(flat.id))
    .map((flat) => flat.id)

  const [pendingPayments, handovers, handoverQueue] = await Promise.all([
    listPendingPayments(manageable).catch(() => []),
    isOwner
      ? listBuildingRemittances(selectedId, 6).catch(() => [])
      : Promise.resolve([]),
    isOwner ? listPendingRemittancePayments().catch(() => []) : Promise.resolve([]),
  ])

  const overdue = snapshot.flats.filter((flat) => flat.rentState === 'overdue').length

  const address = [
    snapshot.building.addressLine,
    snapshot.building.area,
    snapshot.building.city,
  ]
    .filter(Boolean)
    .join(', ')

  const share =
    snapshot.billed > 0 ? Math.min(100, (snapshot.collected / snapshot.billed) * 100) : 0

  const attention = [
    {
      count: pendingPayments.length,
      label: 'resident payments to confirm',
      href: '/payments',
      tone: 'due' as const,
    },
    {
      count: handoverQueue.length,
      label: 'handovers to confirm',
      href: '/remittances',
      tone: 'due' as const,
    },
    {
      count: overdue,
      label: 'flats overdue',
      href: '/dues',
      tone: 'overdue' as const,
    },
  ].filter((item) => item.count > 0)

  return (
    /*
    No container of its own. The app shell's <main> already centres to 1600px
    and sets the padding, so a wrapper here only narrows the page and pads it
    twice — which is why this screen looked cramped next to Flats and Dues.
  */
    <>
      <PageHeader
        title="Control"
        description="Every unit, how far the month has got, and who came through the gate."
      />

      {buildings.length > 1 && (
        <nav aria-label="Buildings" className="mt-5 flex flex-wrap gap-2">
          {buildings.map((building) => (
            <Link
              key={building.id}
              href={`/control?building=${building.id}`}
              aria-current={building.id === selectedId ? 'page' : undefined}
              className={cn(
                'rounded-control border px-3 py-1.5 text-sm transition-colors',
                building.id === selectedId
                  ? 'border-primary/40 bg-primary-soft font-medium text-primary'
                  : 'border-line bg-surface text-muted hover:border-ink/25 hover:text-ink',
              )}
            >
              {building.name}
            </Link>
          ))}
        </nav>
      )}

      {attention.length > 0 && (
        <ul className="mt-5 flex flex-wrap gap-2">
          {attention.map((item) => (
            <li key={item.href + item.label}>
              <Link
                href={item.href}
                className={cn(
                  'inline-flex items-center gap-2 rounded-control border px-3 py-1.5 text-sm transition-colors',
                  item.tone === 'overdue'
                    ? 'border-overdue/40 bg-overdue/10 text-overdue hover:bg-overdue/15'
                    : 'border-due/40 bg-due-soft text-ink hover:border-due/60',
                )}
              >
                <span className="tabular font-mono font-semibold">{item.count}</span>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section className="mt-6 rounded-panel border border-line bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            {/*
              The heading is the way into the building's own page — where flats
              are added and the month is billed. A title that looks like a title
              and behaves like one is the shortest path there.
            */}
            <Link
              href={`/admin/buildings/${snapshot.building.id}`}
              className="group inline-flex items-center gap-1.5"
            >
              <h2 className="text-title text-ink group-hover:underline">
                {snapshot.building.name}
              </h2>
              <ArrowRight
                className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>

            {address && <p className="mt-0.5 text-sm text-muted">{address}</p>}
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="text-right">
              <p className="tabular font-mono text-lg text-ink">
                {formatTaka(snapshot.collected)}
                <span className="text-muted"> of {formatTaka(snapshot.billed)}</span>
              </p>
              <p className="mt-0.5 text-xs text-muted">
                collected in {periodLabel(snapshot.period)}
              </p>
            </div>

            {isOwner && (
              <BillMonth
                scope="building"
                id={snapshot.building.id}
                label={snapshot.building.name}
              />
            )}
          </div>
        </div>

        <div
          className="mt-4 h-1.5 overflow-hidden rounded-full bg-raised"
          role="img"
          aria-label={`${Math.round(share)} percent of the month collected`}
        >
          <div
            className="h-full rounded-full bg-paid transition-[width] duration-500"
            style={{ width: `${share}%` }}
          />
        </div>
      </section>

      <div className="mt-4">
        <ControlPanel
          flats={snapshot.flats}
          gate={snapshot.gate}
          monthLabel={periodLabel(snapshot.period)}
          manageableFlatIds={manageable}
        />
      </div>

      {isOwner && (
        <section className="mt-10">
          <h2 className="text-title text-ink">Handover schedule</h2>

          <p className="mt-1 max-w-[62ch] text-sm leading-relaxed text-muted">
            What each moderator owes you for the flats they cover, and when. Move a date
            here rather than re-billing the month.
          </p>

          <div className="mt-4">
            <HandoverSchedule rows={handovers} buildingId={snapshot.building.id} />
          </div>
        </section>
      )}
    </>
  )
}
