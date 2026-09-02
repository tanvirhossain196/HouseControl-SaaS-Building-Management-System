'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { acceptInviteAction } from './actions'
import { Button } from '@/components/ui/button'
import { FormError } from '@/components/auth/form-error'
import { useToast } from '@/components/providers/toast-provider'

export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function accept() {
    setPending(true)
    setError(null)
    const result = await acceptInviteAction(token)
    setPending(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    toast({ tone: 'success', title: 'You are in', body: 'Your dashboard is ready.' })
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <FormError message={error} />
      <Button size="lg" block loading={pending} onClick={accept}>
        Accept and join
      </Button>
      <p className="text-xs leading-relaxed text-muted">
        Accepting adds you to this building and records it in the audit log. You can be
        removed later by the moderator or the owner.
      </p>
    </div>
  )
}
