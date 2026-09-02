import Link from 'next/link'
import { Lock } from 'lucide-react'
import { pageMetadata } from '@/lib/seo'
import { requireSession } from '@/lib/auth/session'
import { sessionRole } from '@/lib/auth/guards'
import { roleLabels } from '@/lib/auth/permissions'
import { buttonVariants } from '@/components/ui/button'

export const metadata = pageMetadata({
  title: 'Not your screen',
  description: 'Your role does not include this page.',
  path: '/forbidden',
  noIndex: true,
})

/**
 * A 404 here would be dishonest: the page exists, the person simply holds the
 * wrong role. Saying so plainly saves a support message.
 */
export default async function ForbiddenPage({
  searchParams,
}: {
  searchParams: { permission?: string }
}) {
  const session = await requireSession()
  const role = sessionRole(session)

  return (
    <div className="mx-auto max-w-xl py-16">
      <Lock className="size-5 text-muted" aria-hidden />
      <h1 className="mt-4 text-display text-ink">That screen is not yours.</h1>
      <p className="mt-4 text-lead text-muted">
        You are signed in as {roleLabels[role].toLowerCase()}, and this page belongs to a
        different role. Nothing went wrong — ask the building owner if you need the
        access.
      </p>
      {searchParams.permission && (
        <p className="tabular mt-4 font-mono text-xs text-muted">
          Requires {searchParams.permission}
        </p>
      )}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link href="/dashboard" className={buttonVariants({ size: 'lg' })}>
          Back to your dashboard
        </Link>
        <Link
          href="/contact"
          className={buttonVariants({ variant: 'outline', size: 'lg' })}
        >
          Ask for access
        </Link>
      </div>
    </div>
  )
}
