import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { BuildingPanel } from './building-panel'

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="grid-lines pointer-events-none absolute inset-0 opacity-[0.6] [mask-image:radial-gradient(70%_60%_at_50%_0%,black,transparent)]"
      />
      <div className="container relative grid gap-14 py-16 md:py-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-16">
        <div className="max-w-xl">
          <h1 className="text-display-lg text-ink">
            Every flat, every taka, every visitor at the gate.
          </h1>
          <p className="mt-6 max-w-[56ch] text-lead text-muted">
            HouseControl is the panel your building runs on. Rent and dues, shared bills,
            repairs and the gate register live in one place, with a separate view for the
            owner, each flat moderator, every resident and the guard.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/sign-up" className={buttonVariants({ size: 'lg' })}>
              Set up your building
            </Link>
            <Link
              href="/#how-it-works"
              className={buttonVariants({ variant: 'outline', size: 'lg' })}
            >
              See how it works
            </Link>
          </div>
          <p className="mt-5 text-sm text-muted">
            Free for one building up to 12 units. No card needed to start.
          </p>
        </div>

        <div className="lg:pl-4">
          <BuildingPanel />
        </div>
      </div>
    </section>
  )
}
