import { pageMetadata } from '@/lib/seo'
import { requireSession } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { listVisitsForFlats } from '@/services/visitors.service'
import { PageHeader, EmptyState } from '@/components/layout/page-header'
import { PreApprove } from '@/components/gate/pre-approve'
import { VisitLog } from '@/components/gate/visit-log'

export const metadata = pageMetadata({
  title: 'Visitors',
  description: 'Who came to your flat, and who you are expecting.',
  path: '/visitors',
  noIndex: true,
})

/**
 * The resident's side of the gate: their own flat's visitors and nobody
 * else's. RLS decides that — the query cannot be widened by asking
 * differently.
 */
export default async function VisitorsPage() {
  const session = await requireSession('/visitors')
  const flatIds = session.memberships.flats.map((flat) => flat.flatId)

  if (flatIds.length === 0) {
    return (
      <>
        <PageHeader title="Visitors" />
        <EmptyState
          title="No flat yet"
          body="Once you are added to a flat, everyone who comes to see you appears here — and you can pre-approve guests so the guard lets them straight up."
        />
      </>
    )
  }

  const supabase = createServerSupabase()

  const [{ data: flatRows }, visits] = await Promise.all([
    supabase
      .from('flats')
      .select('id, unit_number, buildings(name)')
      .in('id', flatIds)
      .is('archived_at', null),
    listVisitsForFlats(flatIds, 60).catch(() => []),
  ])

  // Embedded selects are not expressible in the hand-written Database type.
  const rows = (flatRows ?? []) as unknown as {
    id: string
    unit_number: string
    buildings: { name: string } | null
  }[]

  const flats = rows.map((flat) => ({
    id: flat.id,
    label: `${flat.buildings?.name ?? 'Building'} · ${flat.unit_number}`,
  }))

  const expected = visits.filter((visit) => visit.state === 'pre_approved')
  const history = visits.filter((visit) => visit.state !== 'pre_approved')

  return (
    <>
      <PageHeader
        title="Visitors"
        description="Everyone the guard logged for your flat, and the guests you are expecting."
      />

      <PreApprove flats={flats} expected={expected} />

      <section className="mt-10">
        <h2 className="text-title text-ink">Who came</h2>
        <div className="mt-4">
          <VisitLog visits={history} />
        </div>
      </section>
    </>
  )
}
