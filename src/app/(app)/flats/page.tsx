import Link from 'next/link'
import { pageMetadata } from '@/lib/seo'
import { requireSession } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { formatTaka } from '@/lib/utils'
import { PageHeader, EmptyState } from '@/components/layout/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'

export const metadata = pageMetadata({
  title: 'My flats',
  description: 'The flats you live in or moderate.',
  path: '/flats',
  noIndex: true,
})

/**
 * The flats this person belongs to. A resident usually has one; a moderator
 * who also rents elsewhere has two. Owners see their own tenancies here and
 * the whole portfolio under /admin/flats.
 */
export default async function MyFlatsPage() {
  const session = await requireSession('/flats')
  const flatIds = session.memberships.flats.map((flat) => flat.flatId)

  const supabase = createServerSupabase()
  const { data } = flatIds.length
    ? await supabase
        .from('flats')
        .select(
          'id, unit_number, floor, monthly_rent, rent_due_day, buildings(name, area)',
        )
        .in('id', flatIds)
    : { data: [] }

  // Embedded selects are not expressible in the hand-written Database type.
  const flats = (data ?? []) as unknown as {
    id: string
    unit_number: string
    floor: number
    monthly_rent: number
    rent_due_day: number
    buildings: { name: string; area: string | null } | null
  }[]

  return (
    <>
      <PageHeader
        title="My flats"
        description="The flats you live in or moderate."
        actions={
          session.isOrgAdmin ? (
            <Link href="/admin/flats" className={buttonVariants({ variant: 'outline' })}>
              All flats you own
            </Link>
          ) : undefined
        }
      />

      {flats.length === 0 ? (
        <EmptyState
          title="You are not in a flat yet"
          body="An owner or a flat moderator invites you by email. Once you accept, the flat appears here with your share of the rent."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {flats.map((flat) => {
            const role = session.memberships.flats.find(
              (item) => item.flatId === flat.id,
            )?.role
            return (
              <Link key={flat.id} href={`/flats/${flat.id}`} className="rounded-panel">
                <Card interactive className="h-full">
                  <CardContent className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="tabular font-mono font-semibold text-ink">
                        {flat.unit_number}
                      </p>
                      {role === 'moderator' && <Badge tone="primary">Moderator</Badge>}
                    </div>
                    <p className="text-sm text-muted">
                      {flat.buildings?.name}
                      {flat.buildings?.area ? `, ${flat.buildings.area}` : ''}
                    </p>
                    <p className="tabular border-t border-line pt-3 font-mono text-sm text-ink">
                      {formatTaka(Number(flat.monthly_rent))}
                      <span className="ml-1 font-sans text-xs text-muted">
                        a month, due on the {flat.rent_due_day}
                      </span>
                    </p>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}
