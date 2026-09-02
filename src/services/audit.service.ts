import 'server-only'

import { createAdminSupabase } from '@/lib/supabase/admin'
import type { Json } from '@/types'

type AuditInput = {
  orgId?: string | null
  actorId?: string | null
  action: string
  entityType: string
  entityId?: string | null
  before?: Json
  after?: Json
  ip?: string | null
  userAgent?: string | null
}

/**
 * Append-only trail of who changed what. Written with the service role because
 * no user is allowed to insert into or edit audit_logs directly.
 *
 * Failures are logged, never thrown: a broken audit write must not roll back
 * the action the user asked for.
 */
export async function writeAuditLog(entry: AuditInput): Promise<void> {
  try {
    const supabase = createAdminSupabase()
    const { error } = await supabase.from('audit_logs').insert({
      org_id: entry.orgId ?? null,
      actor_id: entry.actorId ?? null,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      before_data: entry.before ?? null,
      after_data: entry.after ?? null,
      ip_address: entry.ip ?? null,
      user_agent: entry.userAgent ?? null,
    })
    if (error) console.error('[audit] write failed', error.message)
  } catch (error) {
    console.error('[audit] write failed', error)
  }
}
