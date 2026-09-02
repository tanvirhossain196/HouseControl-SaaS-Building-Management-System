import { Mail, MapPin, Phone } from 'lucide-react'
import { pageMetadata } from '@/lib/seo'
import { site } from '@/lib/site'
import { Section } from '@/components/marketing/section'
import { ContactForm } from '@/components/marketing/contact-form'

export const metadata = pageMetadata({
  title: 'Contact',
  description:
    'Talk to the HouseControl team about setting up your building, pricing, or a demo. We reply within one working day.',
  path: '/contact',
})

const details = [
  {
    icon: Mail,
    label: 'Email',
    value: site.contact.email,
    href: `mailto:${site.contact.email}`,
  },
  {
    icon: Phone,
    label: 'Phone',
    value: site.contact.phone,
    href: `tel:${site.contact.phone.replace(/\s/g, '')}`,
  },
  { icon: MapPin, label: 'Office', value: site.contact.address },
]

export default function ContactPage() {
  return (
    <Section
      heading="Tell us about your building"
      intro="Send the details and we will set up a demo with your own flats and rents, not a sample building."
    >
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-16">
        <ContactForm />

        <aside className="space-y-6 lg:border-l lg:border-line lg:pl-10">
          <ul className="space-y-5">
            {details.map((item) => {
              const Icon = item.icon
              return (
                <li key={item.label} className="flex gap-3">
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                  <div className="text-sm">
                    <p className="font-medium text-ink">{item.label}</p>
                    {item.href ? (
                      <a href={item.href} className="text-muted hover:text-ink">
                        {item.value}
                      </a>
                    ) : (
                      <p className="text-muted">{item.value}</p>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
          <div className="rounded-panel border border-line bg-surface p-5 text-sm">
            <p className="font-medium text-ink">Support hours</p>
            <p className="mt-1.5 leading-relaxed text-muted">
              Sunday to Thursday, 10am–7pm (GMT+6). Pro buildings get a WhatsApp line for
              anything urgent at the gate.
            </p>
          </div>
        </aside>
      </div>
    </Section>
  )
}
