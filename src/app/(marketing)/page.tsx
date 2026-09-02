import { Hero } from '@/components/marketing/hero'
import { Features } from '@/components/marketing/features'
import { HowItWorks } from '@/components/marketing/how-it-works'
import { PricingPreview } from '@/components/marketing/pricing-preview'
import { Testimonials } from '@/components/marketing/testimonials'
import { ClosingCta } from '@/components/marketing/closing-cta'
import { FaqAccordion } from '@/components/marketing/faq-accordion'
import { Section } from '@/components/marketing/section'
import { faqs } from '@/content/faq'

export default function HomePage() {
  return (
    <>
      <Hero />
      <Features />
      <HowItWorks />
      <PricingPreview />
      <Testimonials />
      <Section
        heading="Questions owners ask first"
        intro="If yours is not here, the full list is on the FAQ page."
      >
        <FaqAccordion items={faqs.slice(0, 4)} />
      </Section>
      <ClosingCta />
    </>
  )
}
