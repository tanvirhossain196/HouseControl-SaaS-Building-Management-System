import Link from 'next/link'
import { cn } from '@/lib/utils'

/** Shared frame for every auth screen: title, one line of context, content. */
export function AuthCard({
  title,
  description,
  footer,
  className,
  children,
}: {
  title: string
  description?: string
  footer?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'rounded-sheet border border-line bg-surface p-7 shadow-panel',
        className,
      )}
    >
      <h1 className="text-title text-ink">{title}</h1>
      {description && (
        <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>
      )}
      <div className="mt-7">{children}</div>
      {footer && (
        <div className="mt-7 border-t border-line pt-5 text-sm text-muted">{footer}</div>
      )}
    </div>
  )
}

export function AuthLink({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) {
  return (
    <Link href={href} className="font-medium text-primary hover:underline">
      {children}
    </Link>
  )
}
