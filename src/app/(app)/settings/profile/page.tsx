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
 * Photo on one side, everything else on the other.
 *
 * The identity card is sticky on a wide screen, so the face and the role stay
 * in view while the forms beside it scroll — the two things a person checks
 * they are editing the right account. Below `lg` it stacks, photo first,
 * because on a phone the photo is the thing people came here to change.
 */
export default async function ProfilePage() {
  const session = await requireSession('/settings/profile')
  const role = sessionRole(session)
  const profile = session.profile

  const flats = session.memberships.flats.length
  const orgs = session.memberships.orgs.length
  const joined = (profile?.created_at ?? '').slice(0, 7)

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Your profile"
        description="What other people in your building see, and what you are allowed to do."
      />

      <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
        {/* Identity */}
        <aside className="lg:sticky lg:top-[6rem]">
          <div className="rounded-panel border border-line bg-surface p-6">
            <AvatarUpload
              name={profile?.full_name ?? session.email}
              currentUrl={profile?.avatar_url ?? null}
            />

            <div className="mt-6 border-t border-line pt-5 text-center">
              <p className="truncate text-lg font-semibold text-ink">
                {profile?.full_name ?? 'No name set'}
              </p>
              <p className="mt-1 truncate text-sm text-muted">{session.email}</p>

              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Badge tone="primary">{roleLabels[role]}</Badge>
                <Badge tone={session.isPhoneVerified ? 'paid' : 'due'} dot>
                  {session.isPhoneVerified ? 'Verified' : 'Phone pending'}
                </Badge>
              </div>
            </div>

            <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-5 text-center">
              <div>
                <dt className="text-xs text-muted">Flats</dt>
                <dd className="tabular font-mono text-lg text-ink">{flats}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Orgs</dt>
                <dd className="tabular font-mono text-lg text-ink">{orgs}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Since</dt>
                <dd className="tabular font-mono text-lg text-ink">{joined || '—'}</dd>
              </div>
            </dl>
          </div>
        </aside>

        {/* Everything editable */}
        <div className="space-y-6">
          <section className="rounded-panel border border-line bg-surface p-6">
            <h2 className="text-title text-ink">Your details</h2>
            <p className="mt-1 text-sm text-muted">
              Your name appears on receipts, invites and the resident list.
            </p>
            <div className="mt-5">
              <ProfileForm
                fullName={profile?.full_name ?? ''}
                locale={(profile?.locale as 'en' | 'bn') ?? 'en'}
              />
            </div>
          </section>

          <section className="rounded-panel border border-line bg-surface">
            <div className="p-6 pb-4">
              <h2 className="text-title text-ink">Sign-in and security</h2>
              <p className="mt-1 max-w-[58ch] text-sm text-muted">
                Your email is what you sign in with, so it changes through a confirmation
                link rather than a text box. Your number is verified by code — a profile
                form that could set it silently would make the verification meaningless.
              </p>
            </div>

            <dl className="divide-y divide-line border-t border-line">
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-6">
                <div className="flex min-w-0 gap-3">
                  <Mail className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                  <div className="min-w-0">
                    <dt className="text-sm text-ink">Email</dt>
                    <dd className="truncate text-xs text-muted">{session.email}</dd>
                  </div>
                </div>
                <span className="text-xs text-muted">Used to sign in</span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-6">
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

              <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-6">
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

              <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-6">
                <div className="flex min-w-0 gap-3">
                  <ShieldCheck
                    className="mt-0.5 size-4 shrink-0 text-muted"
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <dt className="text-sm text-ink">Notifications</dt>
                    <dd className="text-xs text-muted">
                      Which notices reach you, and on which channel
                    </dd>
                  </div>
                </div>
                <Link
                  href="/settings/notifications"
                  className={buttonVariants({ variant: 'outline', size: 'sm' })}
                >
                  Change
                </Link>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </div>
  )
}
