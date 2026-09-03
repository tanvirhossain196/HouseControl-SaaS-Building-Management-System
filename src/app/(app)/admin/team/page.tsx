import { pageMetadata } from '@/lib/seo'
import { defaultOrgId, requirePermission } from '@/lib/auth/guards'
import { listInvites } from '@/services/invites.service'
import { createServerSupabase } from '@/lib/supabase/server'
import { PageHeader, EmptyState } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { InviteForm } from './invite-form'

export const metadata = pageMetadata({
  title: 'Invites',
  description: 'Invite owners, moderators, residents and guards.',
  path: '/admin/team',
  noIndex: true,
})

const roleTone = {
  admin: 'primary',
  moderator: 'accent',
  member: 'neutral',
  guard: 'outline',
  super_admin: 'primary',
} as const

export default async function TeamPage() {
  const session = await requirePermission('org.team.manage')
  const orgId = defaultOrgId(session)

  if (!orgId) {
    return (
      <>
        <PageHeader title="Invites" />
        <EmptyState
          title="No organization yet"
          body="Invites belong to an organization. Create your building first and this page fills up."
        />
      </>
    )
  }

  const supabase = createServerSupabase()
  const [invites, { data: flatRows }] = await Promise.all([
    listInvites(orgId).catch(() => []),
    supabase
      .from('flats')
      .select('id, unit_number, buildings!inner(org_id, name)')
      .eq('buildings.org_id', orgId)
      .is('archived_at', null)
      .order('unit_number'),
  ])

  // Embedded joins are not expressible in the hand-written Database type.
  const rows = (flatRows ?? []) as unknown as {
    id: string
    unit_number: string
    buildings: { name: string } | null
  }[]

  const flats = rows.map((row) => ({
    id: row.id,
    label: `${row.buildings?.name ?? 'Building'} · ${row.unit_number}`,
  }))

  return (
    <>
      <PageHeader
        title="Invites"
        description="An invite is the only way into a building. The link is single-use and expires in seven days."
      />

      <InviteForm orgId={orgId} flats={flats} />

      <section className="mt-10">
        <h2 className="text-title text-ink">Sent invites</h2>
        <div className="mt-4">
          {invites.length === 0 ? (
            <EmptyState
              title="Nothing sent yet"
              body="Invite a flat moderator first — they can then invite the residents of their own flat."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Email</TH>
                  <TH>Role</TH>
                  <TH>Flat</TH>
                  <TH>Status</TH>
                  <TH>Expires</TH>
                </TR>
              </THead>
              <TBody>
                {invites.map((invite) => (
                  <TR key={invite.id}>
                    <TD className="text-sm">{invite.email}</TD>
                    <TD>
                      <Badge tone={roleTone[invite.role] ?? 'neutral'}>
                        {invite.role}
                      </Badge>
                    </TD>
                    <TD className="tabular font-mono text-xs text-muted">
                      {invite.flatLabel ?? '—'}
                    </TD>
                    <TD>
                      <Badge
                        tone={
                          invite.status === 'accepted'
                            ? 'paid'
                            : invite.status === 'pending'
                              ? 'due'
                              : 'neutral'
                        }
                        dot
                      >
                        {invite.status}
                      </Badge>
                    </TD>
                    <TD className="tabular font-mono text-xs text-muted">
                      {invite.expiresAt.slice(0, 10)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </div>
      </section>
    </>
  )
}
