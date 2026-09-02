import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-control font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 disabled:pointer-events-none disabled:opacity-50 active:translate-y-px [&_svg]:size-[1.05em] [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-fg shadow-panel hover:bg-primary/90',
        accent: 'bg-accent text-accent-fg hover:bg-accent/90',
        outline:
          'border border-line bg-surface text-ink hover:border-ink/25 hover:bg-raised',
        ghost: 'text-ink hover:bg-raised',
        quiet: 'text-muted hover:bg-raised hover:text-ink',
        danger: 'bg-overdue text-white hover:bg-overdue/90',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-[0.8125rem]',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-[0.9375rem]',
        icon: 'size-10',
        'icon-sm': 'size-8 rounded-tile',
      },
      block: { true: 'w-full' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, block, loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant, size, block }), className)}
      {...props}
    >
      {loading && (
        <span
          aria-hidden
          className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"
        />
      )}
      {children}
    </button>
  ),
)
Button.displayName = 'Button'

export { buttonVariants }
