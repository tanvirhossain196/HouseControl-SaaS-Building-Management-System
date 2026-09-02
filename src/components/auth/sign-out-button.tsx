'use client'

import { useTransition } from 'react'
import { LogOut } from 'lucide-react'
import { signOut } from '@/lib/auth/actions'
import { Button } from '@/components/ui/button'

export function SignOutButton() {
  const [pending, startTransition] = useTransition()

  return (
    <Button
      variant="outline"
      size="sm"
      loading={pending}
      onClick={() => startTransition(() => void signOut())}
    >
      {!pending && <LogOut />}
      Sign out
    </Button>
  )
}
