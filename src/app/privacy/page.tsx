import { pageMetadata } from '@/lib/seo'
import { Section } from '@/components/marketing/section'

export const metadata = pageMetadata({
  title: 'Privacy policy',
  description:
    'What personal data HouseControl collects from owners, moderators, residents and guards, why we hold it, and how to have it deleted.',
  path: '/privacy',
})

export default function PrivacyPage() {
  return (
    <Section heading="Privacy policy" intro="Last updated 2 September 2026.">
      <div className="prose-page">
        <p>
          This policy explains what HouseControl collects, why, and what you can ask us to
          do with it. It is written to be read, not to be survived. It is not legal
          advice: have a lawyer review it before you launch.
        </p>

        <h2>What we collect</h2>
        <ul>
          <li>
            Account details: name, email, mobile number, and the role you hold in a
            building.
          </li>
          <li>
            Building records: flats, rent amounts, dues, payments and uploaded payment
            proof.
          </li>
          <li>
            Operational records: complaints and their photos, visitor entries logged at
            the gate.
          </li>
          <li>Technical data: IP address, device and browser type, and error reports.</li>
        </ul>

        <h2>Why we hold it</h2>
        <p>
          To run the service you signed up for: showing each person the flats and amounts
          they are entitled to see, sending reminders, producing receipts, and keeping an
          audit trail of who changed what.
        </p>

        <h2>Who can see what</h2>
        <p>
          Access follows role. A resident sees their own dues and payments. A flat
          moderator sees their flat. A building owner sees their buildings. Residents
          never see each other&rsquo;s financial records.
        </p>

        <h2>Sharing</h2>
        <p>
          We share data with the processors that run the service — hosting, database,
          email and payment providers — and with authorities where the law requires it. We
          do not sell personal data.
        </p>

        <h2>Retention and deletion</h2>
        <p>
          Financial records are kept while the building is active and for a period
          afterwards for accounting. You can ask for your personal data to be exported or
          deleted by writing to our support address; we respond within 30 days.
        </p>

        <h2>Contact</h2>
        <p>Questions about this policy go to hello@housecontrol.app.</p>
      </div>
    </Section>
  )
}
