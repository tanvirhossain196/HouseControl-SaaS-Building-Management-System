import { pageMetadata } from '@/lib/seo'
import { requirePermission } from '@/lib/auth/guards'
import { createServerSupabase } from '@/lib/supabase/server'
import { PageHeader } from '@/components/layout/page-header'
import { Stat } from '@/components/dashboard/stat'

export const metadata = pageMetadata({
  title: 'Platform',
  description: 'Platform-wide administration.',
  path: '/platform',
  noIndex: true,
})

/**
 * Anthropic-style staff view: counts only, no customer data on screen. Reached
 * only by profiles.platform_role = 'super_admin'.
 */
export default async function PlatformPage() {
  await requirePermission('platform.manage')
  const supabase = createServerSupabase()

  const [orgs, buildings, users] = await Promise.all([
    supabase.from('organizations').select('id', { count: 'exact', head: true }),
    supabase.from('buildings').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
  ])

  return (
    <>
      <PageHeader
        title="Platform"
        description="Counts across every organization. Customer records stay behind their own permissions."
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Organizations" value={String(orgs.count ?? 0)} />
        <Stat label="Buildings" value={String(buildings.count ?? 0)} />
        <Stat label="People" value={String(users.count ?? 0)} />
      </div>
    </>
  )
}
