import { AlertCircle } from 'lucide-react'

/** Form-level failure. Field-level messages live under their own inputs. */
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-control border border-overdue/30 bg-overdue-soft px-3 py-2.5 text-sm text-overdue"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      {message}
    </p>
  )
}
