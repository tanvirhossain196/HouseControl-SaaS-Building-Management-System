'use client'

import * as React from 'react'
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'

/**
 * An error inside the signed-in app.
 *
 * Scoped to this segment so the header, sidebar and session survive: whatever
 * broke, the person is still signed in and can go somewhere else. The root
 * error page would drop all of that and look like the app crashed.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  React.useEffect(() => {
    // Phase 15 sends this to Sentry.
    console.error(error)
  }, [error])

  return (
    <div className="mx-auto max-w-xl py-16">
      <p className="tabular font-mono text-sm text-overdue">Something went wrong</p>
      <h1 className="mt-3 text-display text-ink">This screen did not load.</h1>
      <p className="mt-4 text-lead text-muted">
        Nothing you were doing was lost. Try again, and if it keeps happening send us the
        reference below.
      </p>

      {error.digest && (
        <p className="tabular mt-4 font-mono text-xs text-muted">
          Reference {error.digest}
        </p>
      )}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button onClick={reset} size="lg">
          Try again
        </Button>
        <Link
          href="/dashboard"
          className={buttonVariants({ variant: 'outline', size: 'lg' })}
        >
          Back to the dashboard
        </Link>
      </div>
    </div>
  )
}
