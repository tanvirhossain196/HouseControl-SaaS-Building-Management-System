import { pageMetadata } from '@/lib/seo'
import { Section } from '@/components/marketing/section'

export const metadata = pageMetadata({
  title: 'Terms & conditions',
  description:
    'The terms that apply when you use HouseControl to manage a building: accounts, payments, acceptable use and liability.',
  path: '/terms',
})

export default function TermsPage() {
  return (
    <Section heading="Terms & conditions" intro="Last updated 2 September 2026.">
      <div className="prose-page">
        <p>
          These terms cover your use of HouseControl. Placeholder wording for development
          — replace with reviewed legal text before launch.
        </p>

        <h2>Accounts</h2>
        <p>
          Every account is tied to a verified email address and mobile number. You are
          responsible for what happens under your account, and for the accuracy of the
          rent and payment records you enter.
        </p>

        <h2>Roles and responsibility</h2>
        <p>
          Building owners decide who holds which role. We provide the tools and the audit
          trail; we are not a party to the tenancy agreements between owners and
          residents, and we do not mediate disputes about rent.
        </p>

        <h2>Payments</h2>
        <p>
          Subscription fees are billed per building, per month, in advance. Rent payments
          made through the platform are processed by third-party gateways under their own
          terms. We record the transaction; we do not hold your rent money.
        </p>

        <h2>Acceptable use</h2>
        <p>
          Do not upload unlawful content, attempt to access records outside your role, or
          use the service to harass residents. We may suspend accounts that do.
        </p>

        <h2>Availability and liability</h2>
        <p>
          We aim for continuous availability but do not guarantee it. To the extent
          permitted by law, our liability is limited to the fees paid in the preceding
          three months.
        </p>

        <h2>Changes</h2>
        <p>
          We will give notice in the app before material changes take effect. Continuing
          to use HouseControl after that means you accept the updated terms.
        </p>
      </div>
    </Section>
  )
}
