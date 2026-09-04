import Link from 'next/link'
import { pageMetadata } from '@/lib/seo'
import { requireSession } from '@/lib/auth/session'
import { sessionRole } from '@/lib/auth/guards'
import { roleLabels } from '@/lib/auth/permissions'
import { PageHeader } from '@/components/layout/page-header'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { ProfileForm } from './profile-form'

export const metadata = pageMetadata({
  title: 'Your profile',
  description: 'Your name, your number, and what you can do.',
  path: '/settings/profile',
  noIndex: true,
})

export default async function ProfilePage() {
  const session = await requireSession('/settings/profile')
  const role = sessionRole(session)

  return (
    <>
      <PageHeader
        title="Your profile"
        description="What other people in your building see, and what you are allowed to do."
      />

      <div className="flex items-center gap-4 rounded-panel border border-line bg-surface p-5">
        <Avatar name={session.profile?.full_name ?? session.email} size="lg" />
        <div className="min-w-0">
          <p className="font-medium text-ink">{session.profile?.full_name ?? 'No name set'}</p>
          <p className="truncate text-sm text-muted">{session.email}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone="primary">{roleLabels[role]}</Badge>
            <Badge tone="paid" dot>
              Email verified
            </Badge>
            <Badge tone={session.isPhoneVerified ? 'paid' : 'due'} dot>
              {session.isPhoneVerified
                ? `Phone ${session.profile?.phone ?? 'verified'}`
                : 'Phone not verified'}
            </Badge>
          </div>
        </div>
      </div>

      <section className="mt-10">
        <h2 className="text-title text-ink">Details</h2>
        <div className="mt-4">
          <ProfileForm
            fullName={session.profile?.full_name ?? ''}
            locale={(session.profile?.locale as 'en' | 'bn') ?? 'en'}
          />
        </div>
      </section>

      <section className="mt-10 border-t border-line pt-8">
        <h2 className="text-title text-ink">Sign-in and security</h2>
        <dl className="mt-4 max-w-md divide-y divide-line rounded-panel border border-line bg-surface">
          <div className="flex items-center justify-between gap-4 px-4 py-3.5">
            <div>
              <dt className="text-sm text-ink">Email</dt>
              <dd className="text-xs text-muted">{session.email}</dd>
            </div>
            <span className="text-xs text-muted">Used to sign in</span>
          </div>

          <div className="flex items-center justify-between gap-4 px-4 py-3.5">
            <div>
              <dt className="text-sm text-ink">Mobile number</dt>
              <dd className="text-xs text-muted">
                {session.profile?.phone ?? 'Not added'}
                {session.profile?.phone && !session.isPhoneVerified && ' — not verified'}
              </dd>
            </div>
            <Link
              href="/onboarding/phone"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              {session.isPhoneVerified ? 'Change' : 'Verify'}
            </Link>
          </div>

          <div className="flex items-center justify-between gap-4 px-4 py-3.5">
            <div>
              <dt className="text-sm text-ink">Password</dt>
              <dd className="text-xs text-muted">Changed by emailing yourself a code</dd>
            </div>
            <Link
              href="/forgot-password"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Change
            </Link>
          </div>
        </dl>
      </section>
    </>
  )
}
