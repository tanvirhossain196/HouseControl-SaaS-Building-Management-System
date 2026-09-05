import Link from 'next/link'
import { KeyRound, Mail, Phone, ShieldCheck } from 'lucide-react'
import { pageMetadata } from '@/lib/seo'
import { requireSession } from '@/lib/auth/session'
import { sessionRole } from '@/lib/auth/guards'
import { roleLabels } from '@/lib/auth/permissions'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { AvatarUpload } from '@/components/profile/avatar-upload'
import { ProfileForm } from './profile-form'

export const metadata = pageMetadata({
  title: 'Your profile',
  description: 'Your photo, your name, your number, and what you can do.',
  path: '/settings/profile',
  noIndex: true,
})

/**
 * One centred column rather than the wide layout the rest of the app uses.
 *
 * Everything here is about one person, and a form stretched across a 1600px
 * screen puts the label and its field a hand's width apart.
 */
export default async function ProfilePage() {
  const session = await requireSession('/settings/profile')
  const role = sessionRole(session)
  const profile = session.profile

  const flats = session.memberships.flats.length
  const orgs = session.memberships.orgs.length

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Your profile"
        description="What other people in your building see, and what you are allowed to do."
      />

      <section className="rounded-panel border border-line bg-surface p-8">
        <AvatarUpload
          name={profile?.full_name ?? session.email}
          currentUrl={profile?.avatar_url ?? null}
        />

        <div className="mt-6 border-t border-line pt-6 text-center">
          <p className="text-title text-ink">{profile?.full_name ?? 'No name set'}</p>
          <p className="mt-1 text-sm text-muted">{session.email}</p>

          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Badge tone="primary">{roleLabels[role]}</Badge>
            <Badge tone="paid" dot>
              Email verified
            </Badge>
            <Badge tone={session.isPhoneVerified ? 'paid' : 'due'} dot>
              {session.isPhoneVerified ? 'Phone verified' : 'Phone not verified'}
            </Badge>
          </div>

          <dl className="mt-6 grid grid-cols-3 gap-4 border-t border-line pt-6 text-center">
            <div>
              <dt className="text-xs text-muted">Flats</dt>
              <dd className="tabular font-mono text-xl text-ink">{flats}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Organizations</dt>
              <dd className="tabular font-mono text-xl text-ink">{orgs}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Joined</dt>
              <dd className="tabular font-mono text-xl text-ink">
                {(profile?.created_at ?? '').slice(0, 7) || '—'}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-title text-ink">Your details</h2>
        <p className="mt-1 text-sm text-muted">
          Your name appears on receipts, invites and the resident list.
        </p>
        <div className="mt-4 rounded-panel border border-line bg-surface p-6">
          <ProfileForm
            fullName={profile?.full_name ?? ''}
            locale={(profile?.locale as 'en' | 'bn') ?? 'en'}
          />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-title text-ink">Sign-in and security</h2>
        <p className="mt-1 max-w-[58ch] text-sm text-muted">
          Your email is what you sign in with, so it is changed through a confirmation
          link rather than a text box. Your number is verified by code — a profile form
          that could set it silently would make the verification meaningless.
        </p>

        <dl className="mt-4 divide-y divide-line rounded-panel border border-line bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex min-w-0 gap-3">
              <Mail className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
              <div className="min-w-0">
                <dt className="text-sm text-ink">Email</dt>
                <dd className="truncate text-xs text-muted">{session.email}</dd>
              </div>
            </div>
            <span className="text-xs text-muted">Used to sign in</span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex min-w-0 gap-3">
              <Phone className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
              <div className="min-w-0">
                <dt className="text-sm text-ink">Mobile number</dt>
                <dd className="truncate text-xs text-muted">
                  {profile?.phone ?? 'Not added'}
                  {profile?.phone && !session.isPhoneVerified && ' — not verified'}
                </dd>
              </div>
            </div>
            <Link
              href="/onboarding/phone"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              {session.isPhoneVerified ? 'Change' : 'Verify'}
            </Link>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex min-w-0 gap-3">
              <KeyRound className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
              <div className="min-w-0">
                <dt className="text-sm text-ink">Password</dt>
                <dd className="text-xs text-muted">
                  Changed with a six-digit code sent to your email
                </dd>
              </div>
            </div>
            <Link
              href="/forgot-password"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Change
            </Link>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex min-w-0 gap-3">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
              <div className="min-w-0">
                <dt className="text-sm text-ink">What you can do</dt>
                <dd className="text-xs text-muted">{roleLabels[role]}</dd>
              </div>
            </div>
            <Link
              href="/settings/notifications"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Notifications
            </Link>
          </div>
        </dl>
      </section>
    </div>
  )
}
