import { pageMetadata } from '@/lib/seo'
import { defaultOrgId, requirePermission } from '@/lib/auth/guards'
import { listInvites } from '@/services/invites.service'
import { getFlatRentSummary } from '@/services/flats.service'
import { createServerSupabase } from '@/lib/supabase/server'
import { PageHeader, EmptyState } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { InviteForm } from './invite-form'
import { RevokeButton } from './revoke-button'
import { CopyLinkButton } from './copy-link-button'
import { RentSummaryCard } from './rent-summary-card'

export const metadata = pageMetadata({
  title: 'Invites & Rent Split',
  description: 'Invite owners, moderators, residents and guards, and split flat rent.',
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

  // Embedded joins map
  const rows = (flatRows ?? []) as unknown as {
    id: string
    unit_number: string
    buildings: { name: string } | null
  }[]

  const flats = rows.map((row) => ({
    id: row.id,
    label: `${row.buildings?.name ?? 'Building'} · ${row.unit_number}`,
  }))

  // প্রথম ফ্ল্যাটের ডায়নামিক রেন্ট সামারি লোড করা (যদি ফ্ল্যাট বিদ্যমান থাকে)
  const selectedFlatId = rows?.[0]?.id ?? ''
  const rentSummary = selectedFlatId ? await getFlatRentSummary(selectedFlatId) : null

  return (
    <>
      <PageHeader
        title="Invites & Flat Rent Management"
        description="An invite is the only way into a building. Split rent dynamically, send single-use links that expire in seven days."
      />

      {/* ১. রেন্ট স্প্লিট এবং অবণ্টনকৃত ভাড়ার সামারি কার্ড */}
      {rentSummary && (
        <div className="mb-8">
          <RentSummaryCard summary={rentSummary} />
        </div>
      )}

      {/* ২. নতুন ইনভাইট ফর্ম */}
      <InviteForm orgId={orgId} flats={flats} />

      {/* ৩. পাঠানো ইনভাইটগুলোর তালিকা */}
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
                  <TH>Rent Share</TH>
                  <TH>Status</TH>
                  <TH>Invite Link</TH>
                  <TH>Expires</TH>
                  <TH className="text-right">Action</TH>
                </TR>
              </THead>
              <TBody>
                {invites.map((invite) => (
                  <TR key={invite.id}>
                    <TD className="text-sm font-medium text-ink">{invite.email}</TD>
                    <TD>
                      <Badge tone={roleTone[invite.role] ?? 'neutral'}>
                        {invite.role}
                      </Badge>
                    </TD>
                    <TD className="tabular font-mono text-xs text-muted">
                      {invite.flatLabel ?? '—'}
                    </TD>
                    <TD className="font-semibold text-emerald-600 text-sm">
                      ৳{(invite.rentShare ?? 0).toLocaleString()}
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
                    <TD>
                      {invite.status === 'pending' && invite.link ? (
                        <CopyLinkButton link={invite.link} />
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </TD>
                    <TD className="tabular font-mono text-xs text-muted">
                      {invite.expiresAt ? invite.expiresAt.slice(0, 10) : '—'}
                    </TD>
                    <TD className="text-right">
                      {invite.status === 'pending' && (
                        <RevokeButton inviteId={invite.id} orgId={orgId} />
                      )}
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
