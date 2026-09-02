import { pageMetadata } from '@/lib/seo'
import { AuthCard, AuthLink } from '@/components/auth/auth-card'
import { GoogleButton } from '@/components/auth/google-button'
import { SignInForm } from '@/components/auth/sign-in-form'

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
  const next = searchParams.next?.startsWith('/') ? searchParams.next : '/dashboard'

  return (
    <AuthCard
      title="Sign in"
      description="Your building, your dues, your gate log."
      footer={
        <p>
          New here? <AuthLink href="/sign-up">Create an account</AuthLink>
        </p>
      }
    >
      <div className="space-y-5">
        <GoogleButton next={next} />
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-line" />
          <span className="text-xs text-muted">or use email</span>
          <span className="h-px flex-1 bg-line" />
        </div>
        <SignInForm next={next} />
      </div>
    </AuthCard>
  )
}
