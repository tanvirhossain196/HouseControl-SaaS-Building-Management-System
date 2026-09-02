import Link from 'next/link'
import { pageMetadata } from '@/lib/seo'
import { faqs } from '@/content/faq'
import { Section } from '@/components/marketing/section'
import { FaqAccordion } from '@/components/marketing/faq-accordion'

export const metadata = pageMetadata({
  title: 'FAQ',
  description:
    'Answers about rent splitting, moderator handover, payments, visitor logs and data storage in HouseControl.',
  path: '/faq',
})

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  })),
}

export default function FaqPage() {
  return (
    <Section
      heading="Frequently asked questions"
      intro="Rent splitting, role handover, payments and data. If something is missing, ask us directly."
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <FaqAccordion />
      <p className="mt-8 text-sm text-muted">
        Still stuck?{' '}
        <Link href="/contact" className="text-primary hover:underline">
          Send us your question
        </Link>{' '}
        and we will answer it here.
      </p>
    </Section>
  )
}
