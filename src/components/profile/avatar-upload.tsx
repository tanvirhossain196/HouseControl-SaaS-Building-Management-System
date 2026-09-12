'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Trash2 } from 'lucide-react'
import { saveAvatarAction } from '@/app/(app)/settings/profile/actions'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/providers/toast-provider'

const MAX_BYTES = 2 * 1024 * 1024
const TYPES = ['image/jpeg', 'image/png', 'image/webp']

/**
 * Uploading a profile photo.
 *
 * The file goes straight from the browser to Supabase Storage rather than
 * through a server action: a 2MB image would otherwise be base64-encoded into
 * a request body, arriving a third larger and counting against the action's
 * payload limit. The server only stores the resulting URL.
 *
 * The path is `<user-id>/avatar-<timestamp>.<ext>`. The id prefix is what the
 * storage policy checks, so nobody can write over somebody else's photo; the
 * timestamp is what stops a new upload being hidden by a cached old one.
 */
export function AvatarUpload({
  name,
  currentUrl,
}: {
  name: string
  currentUrl: string | null
}) {
  const router = useRouter()
  const { toast } = useToast()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [pending, setPending] = React.useState(false)
  const [preview, setPreview] = React.useState<string | null>(currentUrl)

  async function upload(file: File) {
    if (!TYPES.includes(file.type)) {
      toast({
        tone: 'error',
        title: 'That file is not a photo',
        body: 'Use a JPG, PNG or WebP.',
      })
      return
    }

    if (file.size > MAX_BYTES) {
      toast({
        tone: 'error',
        title: 'That photo is too large',
        body: `Keep it under 2MB — yours is ${(file.size / 1024 / 1024).toFixed(1)}MB.`,
      })
      return
    }

    setPending(true)

    try {
      /**
       * Loaded when somebody actually picks a file.
       *
       * supabase-js is about 88kB, and it is the only reason this page shipped
       * roughly twice the JavaScript of every other one. Nothing on the profile
       * screen needs it until an avatar is being uploaded — which most visits
       * never do — so it is fetched at that moment instead of on load.
       */
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) throw new Error('Sign in again and retry.')

      const extension = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
      const path = `${user.id}/avatar-${Date.now()}.${extension}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { cacheControl: '3600', upsert: true })

      if (uploadError) throw uploadError

      const {
        data: { publicUrl },
      } = supabase.storage.from('avatars').getPublicUrl(path)

      const result = await saveAvatarAction(publicUrl)
      if (!result.ok) throw new Error(result.error)

      setPreview(publicUrl)
      toast({ tone: 'success', title: 'Photo updated' })
      router.refresh()
    } catch (error) {
      toast({
        tone: 'error',
        title: 'Could not upload the photo',
        body:
          error instanceof Error ? error.message : 'Check your connection and try again.',
      })
    } finally {
      setPending(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function remove() {
    setPending(true)
    const result = await saveAvatarAction(null)
    setPending(false)

    if (!result.ok) {
      toast({ tone: 'error', title: 'Could not remove it', body: result.error })
      return
    }

    setPreview(null)
    toast({ tone: 'success', title: 'Photo removed' })
    router.refresh()
  }

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="relative">
        <Avatar name={name} src={preview ?? undefined} size="xl" />

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={pending}
          aria-label="Change your photo"
          className="absolute -bottom-1 -right-1 inline-flex size-9 items-center justify-center rounded-full border border-line bg-surface text-muted shadow-panel transition-colors hover:text-ink disabled:opacity-60"
        >
          <Camera className="size-4" aria-hidden />
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={TYPES.join(',')}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void upload(file)
        }}
      />

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          loading={pending}
          onClick={() => inputRef.current?.click()}
        >
          {preview ? 'Change photo' : 'Add a photo'}
        </Button>

        {preview && (
          <Button variant="quiet" size="sm" disabled={pending} onClick={remove}>
            <Trash2 /> Remove
          </Button>
        )}
      </div>

      <p className="max-w-[28ch] text-center text-xs leading-relaxed text-muted">
        JPG, PNG or WebP, under 2MB. Your flatmates and the building owner see this next
        to your name.
      </p>
    </div>
  )
}