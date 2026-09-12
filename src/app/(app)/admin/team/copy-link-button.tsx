'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function CopyLinkButton({ link }: { link?: string | null }) {
  const [copied, setCopied] = useState(false)

  if (!link) return <span className="text-xs text-muted">—</span>

  const handleCopy = async () => {
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 gap-1 px-2 text-xs font-normal"
      onClick={handleCopy}
    >
      {copied ? (
        <>
          <Check className="size-3 text-emerald-500" />
          <span className="text-emerald-600 font-medium">Copied</span>
        </>
      ) : (
        <>
          <Copy className="size-3 text-muted" />
          <span>Copy Link</span>
        </>
      )}
    </Button>
  )
}
