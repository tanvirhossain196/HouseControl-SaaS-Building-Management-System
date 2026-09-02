import { MailCheck } from 'lucide-react'
import { pageMetadata } from '@/lib/seo'
import { AuthCard, AuthLink } from '@/components/auth/auth-card'

export const metadata = pageMetadata({
  title: 'Check your email',
  description: 'We sent you a link to continue.',
  path: '/check-email',
  noIndex: true,
})

const copy = {
  verify: {
    title: 'Confirm your email',
    body: 'We sent a verification link. Open it and your account is ready — nothing works until the address is confirmed.',
  },
  link: {
    title: 'Your sign-in link is on the way',
    body: 'Open the link on this device and you will be signed in. It expires in an hour.',
  },
  reset: {
    title: 'Password reset link sent',
    body: 'If an account uses this address, the link is in the inbox. It works once and expires in an hour.',
  },
} as const

export default function CheckEmailPage({
  searchParams,
}: {
  searchParams: { email?: string; reason?: keyof typeof copy }
}) {
  const reason =
    searchParams.reason && copy[searchParams.reason] ? searchParams.reason : 'verify'
  const { title, body } = copy[reason]

  return (
    <AuthCard
      title={title}
      description={body}
      footer={
        <p>
          Nothing arrived? Check spam, then <AuthLink href="/sign-in">try again</AuthLink>
          .
        </p>
      }
    >
      <div className="flex items-center gap-3 rounded-panel border border-line bg-raised/60 p-4">
        <MailCheck className="size-5 shrink-0 text-primary" aria-hidden />
        <p className="text-sm text-ink">
          {searchParams.email ? (
            <>
              Sent to <span className="font-medium">{searchParams.email}</span>
            </>
          ) : (
            'Sent to your inbox.'
          )}
        </p>
      </div>
    </AuthCard>
  )
}
