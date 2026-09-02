import { pageMetadata } from '@/lib/seo'
import { Section } from '@/components/marketing/section'
import { StyleguideClient } from './styleguide-client'

export const metadata = pageMetadata({
  title: 'Design system',
  description:
    'Every HouseControl component in one place: colours, type, controls and states.',
  path: '/styleguide',
  noIndex: true,
})

export default function StyleguidePage() {
  return (
    <Section
      heading="Design system"
      intro="Every token and control the product is built from. Internal page — not indexed, not linked from the site."
    >
      <StyleguideClient />
    </Section>
  )
}
