'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { updateProfileAction } from './actions'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/input'
import { FormError } from '@/components/auth/form-error'
import { useToast } from '@/components/providers/toast-provider'

export function ProfileForm({
  fullName,
  locale,
}: {
  fullName: string
  locale: 'en' | 'bn'
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fields, setFields] = React.useState<Record<string, string[]>>({})

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const data = Object.fromEntries(new FormData(event.currentTarget))
    setPending(true)
    setError(null)
    setFields({})

    const result = await updateProfileAction(data)
    setPending(false)

    if (!result.ok) {
      setError(result.error)
      setFields(result.fieldErrors ?? {})
      return
    }

    toast({ tone: 'success', title: 'Profile updated' })
    router.refresh()
  }

  return (
    <form onSubmit={submit} noValidate className="max-w-md space-y-5">
      <FormError message={error} />

      <Field label="Your name" htmlFor="fullName" error={fields.fullName?.[0]} required>
        <Input
          id="fullName"
          name="fullName"
          defaultValue={fullName}
          autoComplete="name"
        />
      </Field>

      <Field
        label="Language"
        htmlFor="locale"
        hint="Stored now; the Bangla interface is not built yet."
      >
        <Select id="locale" name="locale" defaultValue={locale}>
          <option value="en">English</option>
          <option value="bn">বাংলা</option>
        </Select>
      </Field>

      <Button type="submit" loading={pending}>
        Save changes
      </Button>
    </form>
  )
}
