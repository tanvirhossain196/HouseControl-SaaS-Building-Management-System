'use client'

import * as React from 'react'
import { Check, Download, Share } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { site } from '@/lib/site'

/**
 * Installing the app.
 *
 * There is no file to download — a PWA is installed by the browser, which fires
 * `beforeinstallprompt` when it decides the site qualifies. That event is the
 * only way to open the install dialog from a button of our own, so it is caught
 * and kept until somebody presses this.
 *
 * The button hides itself when the event never arrives, because that means one
 * of three things and all of them make a button useless: the app is already
 * installed, the browser does not support installing, or the site has not met
 * the criteria yet. Showing a control that cannot work is worse than showing
 * nothing.
 *
 * Safari is the exception — it never fires the event but does support installing
 * from the share menu — so iOS gets written instructions instead.
 */

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallApp({
  prominent = false,
}: {
  /**
   * Full-width and loud, for the page whose whole job is installing.
   *
   * Everywhere else this is an aside beside other content and should not shout
   * over it — same component, same logic, different weight.
   */
  prominent?: boolean
}) {
  const [prompt, setPrompt] = React.useState<InstallPromptEvent | null>(null)
  const [installed, setInstalled] = React.useState(false)
  const [isIos, setIsIos] = React.useState(false)

  React.useEffect(() => {
    // Already running as an installed app: nothing to offer.
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // Safari's own flag, which predates the standard media query.
      (window.navigator as { standalone?: boolean }).standalone === true

    if (standalone) {
      setInstalled(true)
      return
    }

    const ua = window.navigator.userAgent
    setIsIos(/iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS/.test(ua))

    const capture = (event: Event) => {
      // Stops Chrome's own banner, so the offer appears where we put it.
      event.preventDefault()
      setPrompt(event as InstallPromptEvent)
    }

    const done = () => {
      setInstalled(true)
      setPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', capture)
    window.addEventListener('appinstalled', done)

    return () => {
      window.removeEventListener('beforeinstallprompt', capture)
      window.removeEventListener('appinstalled', done)
    }
  }, [])

  async function install() {
    if (!prompt) return

    await prompt.prompt()
    await prompt.userChoice

    /**
     * The event is single-use: once prompted, it cannot be prompted again.
     * Clearing it hides the button rather than leaving one that silently does
     * nothing on a second press.
     */
    setPrompt(null)
  }

  if (installed) {
    return (
      <p
        className={cn(
          'flex items-center gap-2 text-sm text-paid',
          prominent && 'justify-center',
        )}
      >
        <Check className="size-4" aria-hidden />
        You are using the installed app.
      </p>
    )
  }

  if (isIos) {
    return (
      <div className="space-y-1.5">
        <p className="flex items-center gap-2 text-sm font-medium text-ink">
          <Share className="size-4" aria-hidden />
          Add to your home screen
        </p>

        <p className="max-w-[52ch] text-sm leading-relaxed text-muted">
          In Safari, tap the share button, then{' '}
          <span className="text-ink">Add to Home Screen</span>. It opens without the
          browser bar, like any other app.
        </p>
      </div>
    )
  }

  if (!prompt) {
    /**
     * No event, and not iOS. The browser either cannot install or has decided
     * this visit does not qualify — Chrome wants a service worker, a manifest
     * and, on a first visit, a little engagement first.
     *
     * The quiet pages render nothing. The install page cannot: arriving
     * somewhere titled "get the app" and finding an empty box is worse than
     * being told plainly what to do instead.
     */
    if (!prominent) return null

    return (
      <p className="max-w-[46ch] text-sm leading-relaxed text-muted">
        Your browser has not offered to install this yet. In Chrome or Edge, look for the
        install icon at the right of the address bar — or open the menu and choose{' '}
        <span className="text-ink">Install {site.name}</span>.
      </p>
    )
  }

  if (prominent) {
    return (
      <Button block size="lg" onClick={install}>
        <Download /> Download and install
      </Button>
    )
  }

  return (
    <Button variant="outline" size="sm" onClick={install}>
      <Download /> Install the app
    </Button>
  )
}
