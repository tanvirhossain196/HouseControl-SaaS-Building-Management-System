'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { requestPasswordReset } from '@/lib/auth/actions'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { FormError } from './form-error'

export function ForgotPasswordForm() {
  const router = useRouter()
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

    const result = await requestPasswordReset(data)
    setPending(false)

    if (!result.ok) {
      setError(result.error)
      setFields(result.fieldErrors ?? {})
      return
    }

    router.push(
      `/check-email?email=${encodeURIComponent(result.data.email)}&reason=reset`,
    )
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <FormError message={error} />
      <Field label="Email" htmlFor="email" error={fields.email?.[0]} required>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          aria-invalid={Boolean(fields.email)}
        />
      </Field>
      <Button type="submit" size="lg" block loading={pending}>
        Send reset link
      </Button>
    </form>
  )
}
