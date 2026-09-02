import { pageMetadata } from '@/lib/seo'
import { Section } from '@/components/marketing/section'

export const metadata = pageMetadata({
  title: 'About',
  description:
    'Why HouseControl exists, who builds it, and how we think about building management software for Bangladesh.',
  path: '/about',
})

export default function AboutPage() {
  return (
    <Section
      heading="Built for buildings that are run by their owners"
      intro="Not by a facilities company with a helpdesk. By one person with a register, a phone and eleven tenants."
    >
      <div className="prose-page">
        <p>
          Most apartment buildings in Dhaka are managed by the family that owns them. Rent
          is collected in cash or by bKash, written into a khata, and argued about at the
          end of the month. Shared bills are split by hand. The guard keeps a paper
          register nobody reads until something goes missing.
        </p>
        <p>
          HouseControl replaces that stack with one panel, without pretending the building
          is a corporate property portfolio. It fits how buildings here actually work:
          shared flats with three or four earning residents, a caretaker who is the real
          decision-maker, payments that arrive in parts, and an owner who wants one number
          — how much is still outstanding.
        </p>

        <h2>What we are careful about</h2>
        <ul>
          <li>
            Nobody sees another resident&rsquo;s dues. Financial visibility follows the
            role, not the building.
          </li>
          <li>
            A role handover needs consent from both people and leaves an audit trail the
            owner can read.
          </li>
          <li>
            Every screen has to work on a mid-range Android phone on a weak signal,
            because that is what the guard and half the residents are holding.
          </li>
        </ul>

        <h2>Where we are</h2>
        <p>
          The product is in active development, built phase by phase. This site is what
          exists today: the design system and the public pages. Accounts, dashboards and
          payments follow.
        </p>
      </div>
    </Section>
  )
}
