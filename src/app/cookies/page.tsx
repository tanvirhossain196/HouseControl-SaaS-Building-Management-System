import { pageMetadata } from '@/lib/seo'
import { Section } from '@/components/marketing/section'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'

export const metadata = pageMetadata({
  title: 'Cookie policy',
  description:
    'The cookies HouseControl sets, what each one does, and how long it lasts.',
  path: '/cookies',
})

const cookies = [
  {
    name: 'hc_session',
    purpose: 'Keeps you signed in',
    type: 'Essential',
    life: '30 days',
  },
  {
    name: 'hc_csrf',
    purpose: 'Protects forms against cross-site requests',
    type: 'Essential',
    life: 'Session',
  },
  {
    name: 'theme',
    purpose: 'Remembers light or dark mode',
    type: 'Preference',
    life: '1 year',
  },
  {
    name: '_ga',
    purpose: 'Anonymous usage statistics',
    type: 'Analytics',
    life: '2 years',
  },
]

export default function CookiesPage() {
  return (
    <Section heading="Cookie policy" intro="Last updated 2 September 2026.">
      <div className="prose-page mb-8">
        <p>
          We set the smallest number of cookies the service can run on. Essential cookies
          keep you signed in and keep forms safe; you cannot turn those off without
          breaking sign-in. Analytics cookies only load if you accept them.
        </p>
      </div>

      <Table>
        <caption className="sr-only">Cookies set by HouseControl</caption>
        <THead>
          <TR>
            <TH>Name</TH>
            <TH>What it does</TH>
            <TH>Type</TH>
            <TH>Lifetime</TH>
          </TR>
        </THead>
        <TBody>
          {cookies.map((c) => (
            <TR key={c.name}>
              <TD className="tabular font-mono text-xs">{c.name}</TD>
              <TD className="text-muted">{c.purpose}</TD>
              <TD className="text-muted">{c.type}</TD>
              <TD className="tabular font-mono text-xs text-muted">{c.life}</TD>
            </TR>
          ))}
        </TBody>
      </Table>

      <div className="prose-page mt-8">
        <h2>Managing cookies</h2>
        <p>
          Your browser can block or clear cookies at any time. Blocking essential cookies
          will sign you out and prevent forms from submitting.
        </p>
      </div>
    </Section>
  )
}
