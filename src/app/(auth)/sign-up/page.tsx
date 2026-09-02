import { pageMetadata } from '@/lib/seo'
import { AuthCard, AuthLink } from '@/components/auth/auth-card'
import { GoogleButton } from '@/components/auth/google-button'
import { SignUpForm } from '@/components/auth/sign-up-form'

export const metadata = pageMetadata({
  title: 'Create an account',
  description:
    'Set up HouseControl for your building. Free for one building up to 12 units.',
  path: '/sign-up',
  noIndex: true,
})

export default function SignUpPage() {
  return (
    <AuthCard
      title="Create your account"
      description="Free for one building up to 12 units. No card needed."
      footer={
        <p>
          Already have an account? <AuthLink href="/sign-in">Sign in</AuthLink>
        </p>
      }
    >
      <div className="space-y-5">
        <GoogleButton next="/onboarding/phone" />
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-line" />
          <span className="text-xs text-muted">or use email</span>
          <span className="h-px flex-1 bg-line" />
        </div>
        <SignUpForm />
      </div>
    </AuthCard>
  )
}
