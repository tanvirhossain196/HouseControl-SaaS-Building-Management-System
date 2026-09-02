import Link from 'next/link'
import { CheckCircle2, ShieldAlert } from 'lucide-react'
import { pageMetadata } from '@/lib/seo'
import { displayName, requireSession } from '@/lib/auth/session'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'

export const metadata = pageMetadata({
  title: 'Dashboard',
  description: 'Your buildings, dues and requests.',
  path: '/dashboard',
  noIndex: true,
})

/**
 * Placeholder until Phase 4 builds the four role dashboards. What it does show
 * is real: who you are signed in as, and exactly what access that gives you.
 */
export default async function DashboardPage() {
  const session = await requireSession()

  const roles = [
    session.isSuperAdmin && 'Platform admin',
    session.isOrgAdmin && 'Building owner',
    session.isModerator && 'Flat moderator',
    session.memberships.flats.some((f) => f.role === 'resident') && 'Resident',
  ].filter(Boolean) as string[]

  return (
    <div className="container py-12">
      <h1 className="text-display text-ink">Welcome back, {displayName(session)}.</h1>
      <p className="mt-3 max-w-[60ch] text-lead text-muted">
        Your account is signed in and verified. Role dashboards, buildings and the dues
        board arrive in the next phase.
      </p>

      {!session.isPhoneVerified && (
        <div className="mt-8 flex flex-col gap-4 rounded-panel border border-due/30 bg-due-soft p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-due" aria-hidden />
            <div>
              <p className="font-medium text-ink">Verify your mobile number</p>
              <p className="mt-1 max-w-[54ch] text-sm text-muted">
                Needed before you can moderate a flat — role handovers send their code to
                this number.
              </p>
            </div>
          </div>
          <Link
            href="/onboarding/phone"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Verify number
          </Link>
        </div>
      )}

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardContent className="space-y-3">
            <p className="text-sm font-medium text-ink">Signed in as</p>
            <p className="break-all text-sm text-muted">{session.email}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Badge tone={session.isPhoneVerified ? 'paid' : 'due'} dot>
                {session.isPhoneVerified ? 'Phone verified' : 'Phone unverified'}
              </Badge>
              <Badge tone="paid" dot>
                Email verified
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3">
            <p className="text-sm font-medium text-ink">What you can do</p>
            {roles.length ? (
              <ul className="space-y-1.5">
                {roles.map((role) => (
                  <li key={role} className="flex items-center gap-2 text-sm text-muted">
                    <CheckCircle2 className="size-4 text-paid" aria-hidden />
                    {role}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm leading-relaxed text-muted">
                No building yet. An owner invites you by email, or you create your own
                building once Phase 5 lands.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3">
            <p className="text-sm font-medium text-ink">Your memberships</p>
            <p className="tabular font-mono text-2xl font-semibold text-ink">
              {session.memberships.orgs.length + session.memberships.flats.length}
            </p>
            <p className="text-sm text-muted">
              {session.memberships.orgs.length} organization
              {session.memberships.orgs.length === 1 ? '' : 's'},{' '}
              {session.memberships.flats.length} flat
              {session.memberships.flats.length === 1 ? '' : 's'}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
