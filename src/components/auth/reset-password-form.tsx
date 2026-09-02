'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { updatePassword } from '@/lib/auth/actions'
import { Button } from '@/components/ui/button'
import { PasswordField } from './password-field'
import { FormError } from './form-error'
import { useToast } from '@/components/providers/toast-provider'

export function ResetPasswordForm() {
  const router = useRouter()
  const { toast } = useToast()
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fields, setFields] = React.useState<Record<string, string[]>>({})

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const data = Object.fromEntries(new FormData(event.currentTarget)) as Record<
      string,
      string
    >
    setPending(true)
    setError(null)
    setFields({})

    const result = await updatePassword(data)
    setPending(false)

    if (!result.ok) {
      setError(result.error)
      setFields(result.fieldErrors ?? {})
      return
    }

    toast({ tone: 'success', title: 'Password changed', body: 'You are signed in.' })
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <FormError message={error} />
      <PasswordField
        label="New password"
        autoComplete="new-password"
        showStrength
        hint="At least 10 characters, with upper and lower case and a number."
        error={fields.password?.[0]}
      />
      <PasswordField
        id="confirmPassword"
        name="confirmPassword"
        label="Confirm new password"
        autoComplete="new-password"
        error={fields.confirmPassword?.[0]}
      />
      <Button type="submit" size="lg" block loading={pending}>
        Change password
      </Button>
    </form>
  )
}
