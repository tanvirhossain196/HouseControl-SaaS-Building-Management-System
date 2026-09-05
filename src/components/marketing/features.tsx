import { Check } from 'lucide-react'
import { features, primaryFeature } from '@/content/features'
import { Section } from './section'
import { getTranslations } from '@/lib/i18n'

export function Features() {
  const { t } = getTranslations()
  const Primary = primaryFeature.icon

  return (
    <Section id="features" heading={t.features.heading} intro={t.features.intro}>
      <div className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-sheet border border-line bg-surface p-7 lg:col-span-2 lg:p-9">
          <Primary className="size-5 text-primary" aria-hidden />
          <h3 className="mt-5 text-title text-ink">{primaryFeature.title}</h3>
          <p className="mt-3 max-w-[58ch] leading-relaxed text-muted">
            {primaryFeature.body}
          </p>
          <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
            {primaryFeature.points?.map((point) => (
              <li key={point} className="flex items-start gap-2.5 text-sm text-ink">
                <Check className="mt-0.5 size-4 shrink-0 text-paid" aria-hidden />
                {point}
              </li>
            ))}
          </ul>
        </article>

        {features.map((feature) => {
          const Icon = feature.icon
          return (
            <article
              key={feature.title}
              className="rounded-panel border border-line bg-surface p-6 transition-colors hover:border-ink/20"
            >
              <Icon className="size-[1.125rem] text-muted" aria-hidden />
              <h3 className="mt-4 font-semibold text-ink">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{feature.body}</p>
            </article>
          )
        })}
      </div>
    </Section>
  )
}
