'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * One base for every field.
 *
 * The hover is a border and a background together: on a dark screen a border
 * alone at these sizes is close to invisible, and the field should answer the
 * pointer before it is clicked. Focus keeps the ring, because hover is
 * courtesy and focus is information — someone tabbing through needs to know
 * exactly where they are.
 */
const fieldBase =
  'w-full rounded-control border border-line bg-surface px-3 text-sm text-ink placeholder:text-muted/60 transition-[border-color,background-color,box-shadow] duration-150 hover:border-ink/25 hover:bg-raised/40 focus:border-primary focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:bg-raised disabled:opacity-60 aria-[invalid=true]:border-overdue aria-[invalid=true]:hover:border-overdue aria-[invalid=true]:focus:ring-overdue/25'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(fieldBase, 'h-10', className)} {...props} />
  ),
)
Input.displayName = 'Input'

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(fieldBase, 'min-h-28 py-2.5', className)}
    {...props}
  />
))
Textarea.displayName = 'Textarea'

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select ref={ref} className={cn(fieldBase, 'h-10 pr-8', className)} {...props} />
))
Select.displayName = 'Select'

/** Label + control + error message, wired together for screen readers. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string
  htmlFor: string
  hint?: string
  error?: string
  required?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
        {required && (
          <span className="ml-1 text-overdue" aria-hidden>
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && (
        <p id={`${htmlFor}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${htmlFor}-error`} className="text-xs font-medium text-overdue">
          {error}
        </p>
      )}
    </div>
  )
}
