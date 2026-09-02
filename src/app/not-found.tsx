import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="container flex min-h-[60vh] max-w-xl flex-col justify-center py-20">
      <p className="tabular font-mono text-sm text-muted">Error 404</p>
      <h1 className="mt-3 text-display text-ink">No flat at this address.</h1>
      <p className="mt-4 text-lead text-muted">
        The page you asked for does not exist, or it moved. The links below cover most of
        what is here.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link href="/" className={buttonVariants({ size: 'lg' })}>
          Back to home
        </Link>
        <Link href="/faq" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
          Read the FAQ
        </Link>
      </div>
    </div>
  )
}
