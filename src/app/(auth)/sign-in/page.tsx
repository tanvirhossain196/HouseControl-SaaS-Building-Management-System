import { pageMetadata } from '@/lib/seo'
import { AuthCard, AuthLink } from '@/components/auth/auth-card'
import { GoogleButton } from '@/components/auth/google-button'
import { SignInForm } from '@/components/auth/sign-in-form'
import { getTranslations } from '@/lib/i18n'

export const metadata = pageMetadata({
  title: 'Sign in',
  description: 'Sign in to HouseControl to manage your building, dues and residents.',
  path: '/sign-in',
  noIndex: true,
})

export default function SignInPage({
  searchParams,
}: {
  searchParams: { next?: string }
}) {
  const { t } = getTranslations()
  const next = searchParams.next?.startsWith('/') ? searchParams.next : '/dashboard'

  return (
    <AuthCard
      title={t.auth.signInTitle}
      description={t.auth.signInSubtitle}
      footer={
        <p>
          {t.auth.noAccount} <AuthLink href="/sign-up">{t.auth.createAccount}</AuthLink>
        </p>
      }
    >
      <div className="space-y-5">
        <GoogleButton next={next} />
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-line" />
          <span className="text-xs text-muted">{t.auth.orUseEmail}</span>
          <span className="h-px flex-1 bg-line" />
        </div>
        <SignInForm next={next} />
      </div>
    </AuthCard>
  )
}
