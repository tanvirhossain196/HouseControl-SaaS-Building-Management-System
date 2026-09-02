import { Plus } from 'lucide-react'
import { faqs } from '@/content/faq'

/** Native disclosure elements — keyboard and screen-reader support come for free. */
export function FaqAccordion({ items = faqs }: { items?: typeof faqs }) {
  return (
    <div className="max-w-3xl divide-y divide-line border-y border-line">
      {items.map((item) => (
        <details key={item.q} className="group">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-6 py-5 text-[0.975rem] font-medium text-ink [&::-webkit-details-marker]:hidden">
            {item.q}
            <Plus
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-muted transition-transform duration-200 group-open:rotate-45"
            />
          </summary>
          <p className="max-w-[64ch] pb-5 text-sm leading-relaxed text-muted">{item.a}</p>
        </details>
      ))}
    </div>
  )
}
