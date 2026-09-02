import { steps } from '@/content/features'
import { Section } from './section'

export function HowItWorks() {
  return (
    <Section
      id="how-it-works"
      heading="Three steps to a building that runs itself"
      intro="Set it up once. After that the month repeats on its own."
      className="rule bg-surface"
    >
      <ol className="grid gap-8 md:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title} className="border-t-2 border-primary/25 pt-5">
            <span className="tabular font-mono text-sm text-primary">
              Step {index + 1}
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
