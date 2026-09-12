import Link from 'next/link'
import { WifiOff } from 'lucide-react'

import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  title: 'Offline',
  description: 'You are not connected.',
  path: '/offline',
  noIndex: true,
})

/**
 * Shown when a page was never cached and there is nothing to fall back to.
 *
 * It says what is and is not possible rather than apologising. The important
 * line is the second one: nothing anybody typed has been lost, because nothing
 * can be typed offline in the first place. People assume the opposite and go
 * looking for work they never did.
 */
export default function OfflinePage() {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center px-4 text-center">
      <WifiOff className="size-8 text-muted" aria-hidden />

      <h1 className="mt-4 text-title text-ink">No connection</h1>

      <p className="mt-2 text-sm leading-relaxed text-muted">
        This page has not been opened on this device before, so there is no copy to show
        you. Pages you have already visited still work offline.
      </p>

      <p className="mt-3 text-sm leading-relaxed text-muted">
        Nothing has been lost. Rent, payments and handovers are only ever recorded while
        you are online, so there is no half-finished work waiting somewhere.
      </p>

      <Link
        href="/dashboard"
        className="mt-6 rounded-control border border-line bg-surface px-4 py-2 text-sm text-ink transition-colors hover:border-ink/25"
      >
        Try the dashboard
      </Link>
    </div>
  )
}
