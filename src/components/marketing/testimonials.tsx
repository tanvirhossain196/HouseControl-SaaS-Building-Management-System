import { Avatar } from '@/components/ui/avatar'
import { Section } from './section'

/** Placeholder quotes — swap for real ones before launch. */
const quotes = [
  {
    quote:
      'Rent used to take the first week of every month. Now I open the panel, see two red tiles, and call two people instead of eleven.',
    name: 'Shahnaz Karim',
    role: 'Owner, 11 units, Mohammadpur',
  },
  {
    quote:
      'The gate log settled an argument we had been having for a year about who lets couriers upstairs.',
    name: 'Aminul Haque',
    role: 'Flat moderator, Uttara Sector 7',
  },
]

export function Testimonials() {
  return (
    <Section className="rule bg-surface">
      <div className="grid gap-10 md:grid-cols-2 md:gap-14">
        {quotes.map((q) => (
          <figure key={q.name} className="max-w-[46ch]">
            <blockquote className="text-[1.15rem] leading-relaxed text-ink">
              {q.quote}
            </blockquote>
            <figcaption className="mt-5 flex items-center gap-3">
              <Avatar name={q.name} />
              <span className="text-sm">
                <span className="block font-medium text-ink">{q.name}</span>
                <span className="block text-muted">{q.role}</span>
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </Section>
  )
}
