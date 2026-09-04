import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  // Square like everything else. The dot inside stays round — it is a status
  // light, not a container.
  'inline-flex items-center gap-1.5 rounded-control px-2 py-0.5 text-xs font-medium',
  {
    variants: {
      tone: {
        neutral: 'bg-raised text-muted',
        primary: 'bg-primary-soft text-primary',
        accent: 'bg-accent-soft text-accent',
        paid: 'bg-paid-soft text-paid',
        due: 'bg-due-soft text-due',
        overdue: 'bg-overdue-soft text-overdue',
        outline: 'border border-line text-muted',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  dot?: boolean
}

export function Badge({ className, tone, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}
