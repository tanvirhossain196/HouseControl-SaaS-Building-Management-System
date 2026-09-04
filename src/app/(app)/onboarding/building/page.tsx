import { redirect } from 'next/navigation'
import { pageMetadata } from '@/lib/seo'
import { requireSession } from '@/lib/auth/session'
import { PageHeader } from '@/components/layout/page-header'
import { SetupForm } from './setup-form'

export const metadata = pageMetadata({
  title: 'Set up your building',
  description: 'Create your organization and your first building.',
  path: '/onboarding/building',
  noIndex: true,
})

/**
 * The path from "I signed up" to "I own a building", which until now only
 * existed as three SQL statements in the README.
 */
export default async function SetUpBuildingPage() {
  const session = await requireSession('/onboarding/building')

  // Somebody who already owns an organization belongs on the buildings page,
  // where a second building is one button.
  if (session.memberships.orgs.some((org) => org.role === 'admin')) {
    redirect('/admin')
  }

  return (
    <div className="mx-auto max-w-2xl py-4">
      <PageHeader
        title="Set up your building"
        description="Two minutes. You can change every part of it afterwards, and nothing is charged."
      />
      <SetupForm />
    </div>
  )
}
