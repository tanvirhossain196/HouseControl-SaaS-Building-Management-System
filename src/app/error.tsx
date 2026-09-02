'use client'

import * as React from 'react'
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  React.useEffect(() => {
    // Phase 15 wires this to Sentry.
    console.error(error)
  }, [error])

  return (
    <div className="container flex min-h-[60vh] max-w-xl flex-col justify-center py-20">
      <p className="tabular font-mono text-sm text-overdue">Error 500</p>
      <h1 className="mt-3 text-display text-ink">This page did not load.</h1>
      <p className="mt-4 text-lead text-muted">
        The request failed on our side. Nothing you entered was lost. Try again, and if it
        keeps failing, send us the reference below.
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
          href="/contact"
          className={buttonVariants({ variant: 'outline', size: 'lg' })}
        >
          Report the problem
        </Link>
      </div>
    </div>
  )
}
