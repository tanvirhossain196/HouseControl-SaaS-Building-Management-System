'use client'

import * as React from 'react'
import { Trash2, Loader2 } from 'lucide-react'
import { revoke } from './actions'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/providers/toast-provider'

export function RevokeButton({
  inviteId,
  orgId,
}: {
  inviteId: string
  orgId: string
}) {
  const { toast } = useToast()
  const [pending, setPending] = React.useState(false)

  async function handleRevoke() {
    if (!confirm('Are you sure you want to revoke/delete this invite?')) return

    setPending(true)
    const result = await revoke(inviteId, orgId)
    setPending(false)

    if (!result.ok) {
      toast({
        tone: 'error',
        title: 'Failed to revoke',
        body: result.error || 'Something went wrong.',
      })
      return
    }

    toast({
      tone: 'success',
      title: 'Invite deleted',
      body: 'The pending invite has been cancelled.',
    })
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 px-2 text-rose-500 hover:bg-rose-500/10 hover:text-rose-600"
      disabled={pending}
      onClick={handleRevoke}
      title="Delete invite"
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Trash2 className="size-3.5" />
      )}
      <span className="ml-1 text-xs font-normal">Delete</span>
    </Button>
  )
}
