import { pageMetadata } from '@/lib/seo'
import { defaultOrgId, requirePermission } from '@/lib/auth/guards'
import { createServerSupabase } from '@/lib/supabase/server'
import { PageHeader, EmptyState } from '@/components/layout/page-header'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

export const metadata = pageMetadata({
  title: 'Audit log',
  description: 'Who changed what, and when.',
  path: '/admin/audit',
  noIndex: true,
})

/**
 * Append-only by design: `audit_logs` has a read policy for org admins and no
 * insert, update or delete policy at all. Only the service role writes it.
 */
export default async function AuditPage() {
  const session = await requirePermission('org.audit.view')
  const orgId = defaultOrgId(session)

  const supabase = createServerSupabase()
  const { data: entries } = orgId
    ? await supabase
        .from('audit_logs')
        .select('id, action, entity_type, entity_id, actor_id, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(100)
    : { data: [] }

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every role change, payment confirmation and removal, in the order it happened. Nobody can edit this — not even you."
      />

      {(entries ?? []).length === 0 ? (
        <EmptyState
          title="Nothing recorded yet"
          body="Entries appear as people join, payments are confirmed and roles change hands."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>When</TH>
              <TH>Action</TH>
              <TH>On</TH>
            </TR>
          </THead>
          <TBody>
            {(entries ?? []).map((entry) => (
              <TR key={entry.id}>
                <TD className="tabular whitespace-nowrap font-mono text-xs text-muted">
                  {new Date(entry.created_at).toLocaleString('en-GB', {
                    timeZone: 'Asia/Dhaka',
                  })}
                </TD>
                <TD>
                  <Badge tone="neutral">{entry.action}</Badge>
                </TD>
                <TD className="tabular font-mono text-xs text-muted">
                  {entry.entity_type}
                  {entry.entity_id ? ` · ${entry.entity_id.slice(0, 8)}` : ''}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  )
}
