import { pageMetadata } from '@/lib/seo'
import { AuthCard, AuthLink } from '@/components/auth/auth-card'
import { GoogleButton } from '@/components/auth/google-button'
import { SignUpForm } from '@/components/auth/sign-up-form'
import { getTranslations } from '@/lib/i18n'
import { limitsFor } from '@/lib/pricing'

export const metadata = pageMetadata({
  title: 'Create an account',
  description: `Set up HouseControl for your building. Free for one building up to ${limitsFor('free').units} units.`,
  path: '/sign-up',
  noIndex: true,
})

export default function SignUpPage() {
  const { t } = getTranslations()

  return (
    <AuthCard
      title={t.auth.signUpTitle}
      description={t.auth.signUpSubtitle}
      footer={
        <p>
          {t.auth.haveAccount} <AuthLink href="/sign-in">{t.auth.signInTitle}</AuthLink>
        </p>
      }
    >
      <div className="space-y-5">
        <GoogleButton next="/onboarding/phone" />
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-line" />
          <span className="text-xs text-muted">{t.auth.orUseEmail}</span>
          <span className="h-px flex-1 bg-line" />
        </div>
        <SignUpForm />
      </div>
    </AuthCard>
  )
}