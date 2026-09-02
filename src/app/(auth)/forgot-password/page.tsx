import { pageMetadata } from '@/lib/seo'
import { AuthCard, AuthLink } from '@/components/auth/auth-card'
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form'

export const metadata = pageMetadata({
  title: 'Reset your password',
  description: 'Send yourself a link to set a new HouseControl password.',
  path: '/forgot-password',
  noIndex: true,
})

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Reset your password"
      description="Enter the address you sign in with. The link works once and expires in an hour."
      footer={
        <p>
          Remembered it? <AuthLink href="/sign-in">Back to sign in</AuthLink>
        </p>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  )
}
