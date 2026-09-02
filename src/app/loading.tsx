import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="container py-20" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading page</span>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-6 h-12 w-full max-w-xl" />
      <Skeleton className="mt-3 h-12 w-full max-w-md" />
      <Skeleton className="mt-8 h-4 w-full max-w-lg" />
      <Skeleton className="mt-2 h-4 w-full max-w-sm" />
      <div className="mt-12 grid gap-4 md:grid-cols-3">
        <Skeleton className="h-44 rounded-panel md:col-span-2" />
        <Skeleton className="h-44 rounded-panel" />
      </div>
    </div>
  )
}
