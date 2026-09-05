import { steps } from '@/content/features'
import { Section } from './section'
import { getTranslations } from '@/lib/i18n'

export function HowItWorks() {
  const { t } = getTranslations()

  return (
    <Section
      id="how-it-works"
      heading={t.steps.heading}
      intro={t.steps.intro}
      className="rule bg-surface"
    >
      <ol className="grid gap-8 md:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title} className="border-t-2 border-primary/25 pt-5">
            <span className="tabular font-mono text-sm text-primary">
              {t.steps.step} {index + 1}
            </span>
            <h3 className="mt-2 text-title text-ink">{step.title}</h3>
            <p className="mt-2 max-w-[42ch] text-sm leading-relaxed text-muted">
              {step.body}
            </p>
          </li>
        ))}
      </ol>
    </Section>
  )
}
