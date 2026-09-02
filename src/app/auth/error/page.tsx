import Link from 'next/link'
import { pageMetadata } from '@/lib/seo'
import { buttonVariants } from '@/components/ui/button'

export const metadata = pageMetadata({
  title: 'Sign-in link problem',
  description: 'That sign-in link did not work.',
  path: '/auth/error',
  noIndex: true,
})

const reasons: Record<string, string> = {
  expired:
    'That link has already been used or has expired. Links work once and last an hour.',
  missing_code:
    'That link is incomplete. Copy the whole link from the email, or request a new one.',
}

export default function AuthErrorPage({
  searchParams,
}: {
  searchParams: { reason?: string }
}) {
  const reason = searchParams.reason ?? ''
  const message =
    reasons[reason] ??
    'We could not complete the sign-in. Request a new link and try again.'

  return (
    <div className="container flex min-h-dvh max-w-xl flex-col justify-center py-20">
      <p className="tabular font-mono text-sm text-due">Sign-in link</p>
      <h1 className="mt-3 text-display text-ink">This link did not work.</h1>
      <p className="mt-4 text-lead text-muted">{message}</p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link href="/sign-in" className={buttonVariants({ size: 'lg' })}>
          Back to sign in
        </Link>
        <Link
          href="/contact"
          className={buttonVariants({ variant: 'outline', size: 'lg' })}
        >
          Get help
        </Link>
      </div>
    </div>
  )
}
