import Link from 'next/link'

import { pageMetadata } from '@/lib/seo'

import { requireSession } from '@/lib/auth/session'
import { MoveOutButton } from '@/components/property/move-out-button'

import { getMyFlat } from '@/services/my-flat.service'

import { PageHeader, EmptyState } from '@/components/layout/page-header'

import { Card, CardContent } from '@/components/ui/card'

import { Badge } from '@/components/ui/badge'

import { formatTaka } from '@/lib/utils'

export const metadata = pageMetadata({
  title: 'My Flat',

  description: 'Your flat details and information.',

  path: '/my-flat',

  noIndex: true,
})

export default async function MyFlatPage() {
  const session = await requireSession('/my-flat')

  const flats = await getMyFlat(session.userId)

  return (
    <>
      <PageHeader
        title="
        My Flat
        "

        description="
        View your flat details,
        rent information and building details.
        "
      />

      {flats.length === 0 ? (
        <EmptyState
          title="
            No flat assigned
            "

          body="
            You do not have any flat assigned yet.
            An owner or moderator can invite you.
            "
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {flats.map((flat) => {
            const me = flat.members.find((member) => member.userId === session.userId)

            // Someone else still living here is what stops a moderator leaving.
            const othersRemain = flat.activeResidents.some(
              (member) => member.userId !== session.userId,
            )

            return (
              <div key={flat.id} className="flex flex-col gap-2">
                <Link href={`/flats/${flat.id}`}>
                  <Card
                    interactive

                    className="h-full"
                  >
                    <CardContent className="space-y-4">
                      <div className="flex justify-between">
                        <h3 className="font-mono text-lg font-semibold">
                          {flat.unit_number}
                        </h3>

                        <Badge tone="primary">
                          {flat.role === 'moderator' ? 'Moderator' : 'Resident'}
                        </Badge>
                      </div>

                      <div>
                        <p className="text-sm text-muted">Building</p>

                        <p className="font-medium">{flat.building?.name ?? 'Unknown'}</p>

                        {flat.building?.area && (
                          <p className="text-sm text-muted">{flat.building.area}</p>
                        )}
                      </div>

                      <div className="border-t border-line pt-3">
                        <p className="text-sm text-muted">Monthly Rent</p>

                        <p className="font-mono font-semibold">
                          {formatTaka(flat.monthly_rent)}
                        </p>
                      </div>

                      <div>
                        <p className="text-sm text-muted">Rent Due Date</p>

                        <p>Every month {flat.rent_due_day}</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>

                {/*
              Outside the Link on purpose: a button inside a link is a hit
              target fighting another hit target, and on a phone the wrong one
              usually wins.
            */}
                <div className="flex justify-end">
                  <MoveOutButton
                    flatId={flat.id}
                    unitNumber={flat.unit_number}
                    outstanding={me?.outstanding ?? 0}
                    isModerator={flat.role === 'moderator'}
                    othersRemain={othersRemain}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
