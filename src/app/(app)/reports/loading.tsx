import { Skeleton } from '@/components/ui/skeleton'

/** Reports aggregate across every flat, so this one is worth its own shape. */
export default function ReportsLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Working out the numbers</span>

      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-3 h-4 w-full max-w-lg" />

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-28 rounded-panel" />
        ))}
      </div>

      <Skeleton className="mt-10 h-6 w-32" />
      <Skeleton className="mt-4 h-48 rounded-panel" />

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-panel" />
        <Skeleton className="h-64 rounded-panel" />
      </div>
    </div>
  )
}
