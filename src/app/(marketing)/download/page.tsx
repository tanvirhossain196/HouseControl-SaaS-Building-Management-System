import Link from 'next/link'
import { ArrowLeft, ArrowRight, MonitorSmartphone, WifiOff, Zap } from 'lucide-react'

import { pageMetadata } from '@/lib/seo'
import { site } from '@/lib/site'
import { InstallApp } from '@/components/layout/install-app'

export const metadata = pageMetadata({
  title: 'Get the app',
  description: `Install ${site.name} on your phone, tablet or computer.`,
  path: '/download',
})

/**
 * The install page.
 *
 * There is no file here to download, and the page does not pretend otherwise —
 * it installs through the browser, which is faster and safer than an APK from
 * a website, and says so rather than hiding it behind the word "download".
 *
 * Public on purpose. Somebody deciding whether to sign up should be able to see
 * that it works like an app first.
 */
export default function DownloadPage() {
  const points = [
    {
      icon: MonitorSmartphone,
      title: 'Every device',
      body: 'Android, iPhone, Windows and Mac. One install, the same screens.',
    },
    {
      icon: WifiOff,
      title: 'Works without a connection',
      body: 'Pages you have already opened stay readable. Money is only ever recorded online.',
    },
    {
      icon: Zap,
      title: 'Nothing to update',
      body: 'It is the website in an app window, so it is never a version behind.',
    },
  ]

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-14 sm:px-6">
      <div className="rounded-sheet border border-line bg-surface p-8 text-center shadow-panel">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/icon-192.png"
          alt=""
          width={88}
          height={88}
          className="mx-auto rounded-panel"
        />

        <h1 className="mt-5 text-display text-ink">{site.name}</h1>

        <p className="mx-auto mt-2 max-w-[42ch] text-sm leading-relaxed text-muted">
          Install it on this device for its own icon and a window without the browser bar.
          Nothing is downloaded from a file host — your browser does the installing.
        </p>

        <div className="mt-7">
          <InstallApp prominent />
        </div>

        <div className="mt-7 flex items-center justify-between gap-4 border-t border-line pt-5 text-sm">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-muted transition-colors hover:text-ink"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            Home
          </Link>

          <Link
            href="/sign-in"
            className="inline-flex items-center gap-1.5 text-primary underline-offset-4 hover:underline"
          >
            Sign in instead
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      </div>

      <ul className="mt-8 space-y-3">
        {points.map((point) => (
          <li
            key={point.title}
            className="flex items-start gap-3 rounded-panel border border-line bg-surface p-5"
          >
            <point.icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />

            <div>
              <p className="text-sm font-medium text-ink">{point.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">{point.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
