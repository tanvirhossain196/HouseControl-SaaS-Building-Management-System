import { Skeleton } from '@/components/ui/skeleton'

/**
 * The shape of a page while its data is on the way.
 *
 * Deliberately close to the real layout — a heading, four stats, a table —
 * so nothing jumps when the content arrives. Every screen behind sign-in
 * fetches from Postgres, so this is what people see on a slow connection at
 * the gate.
 */
export default function AppLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>

      <Skeleton className="h-8 w-64" />
      <Skeleton className="mt-3 h-4 w-full max-w-md" />

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-28 rounded-panel" />
        ))}
      </div>

      <Skeleton className="mt-10 h-6 w-40" />
      <div className="mt-4 space-y-px overflow-hidden rounded-panel border border-line">
        {[0, 1, 2, 3, 4].map((index) => (
          <Skeleton key={index} className="h-16 rounded-none" />
        ))}
      </div>
    </div>
  )
}
