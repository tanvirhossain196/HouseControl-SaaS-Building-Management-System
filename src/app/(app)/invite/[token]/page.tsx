import { pageMetadata } from '@/lib/seo'
import { requireSession } from '@/lib/auth/session'
import { previewInvite } from '@/services/invites.service'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { AcceptInvite } from './accept-invite'

export const metadata = pageMetadata({
  title: 'Join a building',
  description: 'Accept your invitation to a building on HouseControl.',
  path: '/invite',
  noIndex: true,
})

const roleCopy: Record<string, string> = {
  admin: 'You will be able to manage every building in this organization.',
  moderator:
    'You will run this flat: bill the rent, confirm payments, and invite the people living in it.',
  member: 'You will see your own dues and payments, and nobody else’s.',
  guard:
    'You will log visitors at the gate. No financial records are visible to this role.',
}

/**
 * Middleware sends an anonymous visitor to sign-in and back here, so by the
 * time this renders there is a session to bind the invite to.
 */
export default async function InvitePage({ params }: { params: { token: string } }) {
  const session = await requireSession(`/invite/${params.token}`)

  let invite: Awaited<ReturnType<typeof previewInvite>> | null = null
  let error: string | null = null

  try {
    invite = await previewInvite(params.token)
  } catch (cause) {
    error = cause instanceof Error ? cause.message : 'This invite is not valid.'
  }

  if (!invite) {
    return (
      <div className="mx-auto max-w-lg py-16">
        <PageHeader title="This invite did not work." description={error ?? undefined} />
        <p className="text-sm text-muted">
          Ask whoever sent it for a fresh link — invites expire after seven days and each
          one works once.
        </p>
      </div>
    )
  }

  const wrongAccount = invite.email.toLowerCase() !== session.email.toLowerCase()

  return (
    <div className="mx-auto max-w-lg py-12">
      <PageHeader
        title={`Join ${invite.orgName}`}
        description={roleCopy[invite.role] ?? 'You have been invited to a building.'}
      />

      <dl className="divide-y divide-line rounded-panel border border-line bg-surface">
        <div className="flex justify-between gap-4 px-4 py-3 text-sm">
          <dt className="text-muted">Role</dt>
          <dd>
            <Badge tone="primary">{invite.role}</Badge>
          </dd>
        </div>
        {invite.flatLabel && (
          <div className="flex justify-between gap-4 px-4 py-3 text-sm">
            <dt className="text-muted">Flat</dt>
            <dd className="tabular font-mono text-ink">{invite.flatLabel}</dd>
          </div>
        )}
        {invite.rentShare !== null && (
          <div className="flex justify-between gap-4 px-4 py-3 text-sm">
            <dt className="text-muted">Your rent share</dt>
            <dd className="tabular font-mono text-ink">৳{invite.rentShare}</dd>
          </div>
        )}
        <div className="flex justify-between gap-4 px-4 py-3 text-sm">
          <dt className="text-muted">Sent to</dt>
          <dd className="text-ink">{invite.email}</dd>
        </div>
      </dl>

      <div className="mt-6">
        {wrongAccount ? (
          <p className="rounded-control border border-due/30 bg-due-soft px-4 py-3 text-sm text-ink">
            This invite was sent to {invite.email}, but you are signed in as{' '}
            {session.email}. Sign out and sign back in with the invited address.
          </p>
        ) : (
          <AcceptInvite token={params.token} />
        )}
      </div>
    </div>
  )
}
