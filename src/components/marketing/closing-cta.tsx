import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function ClosingCta() {
  return (
    <section className="container py-18 md:py-26">
      <div className="rounded-sheet bg-primary px-7 py-12 text-primary-fg md:px-12 md:py-16">
        <h2 className="max-w-[20ch] text-display">Put your building on one screen.</h2>
        <p className="mt-4 max-w-[52ch] text-lead text-primary-fg/80">
          Add your flats, invite your residents, and let this month collect itself.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/contact"
            className={cn(
              buttonVariants({ size: 'lg' }),
              'bg-surface text-ink hover:bg-surface/90',
            )}
          >
            Set up your building
          </Link>
          <Link
            href="/contact"
            className={cn(
              buttonVariants({ variant: 'outline', size: 'lg' }),
              'border-primary-fg/30 bg-transparent text-primary-fg hover:border-primary-fg/60 hover:bg-primary-fg/10',
            )}
          >
            Talk to us first
          </Link>
        </div>
      </div>
    </section>
  )
}
