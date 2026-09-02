import { redirect } from 'next/navigation'
import { pageMetadata } from '@/lib/seo'
import { getSession } from '@/lib/auth/session'
import { AuthCard, AuthLink } from '@/components/auth/auth-card'
import { ResetPasswordForm } from '@/components/auth/reset-password-form'

export const metadata = pageMetadata({
  title: 'Set a new password',
  description: 'Choose a new password for your HouseControl account.',
  path: '/reset-password',
  noIndex: true,
})

/**
 * Reached only through the recovery link, which puts a short-lived session in
 * place. Without that session there is nothing to reset.
 */
export default async function ResetPasswordPage() {
  const session = await getSession()
  if (!session) redirect('/forgot-password?expired=1')

  return (
    <AuthCard
      title="Set a new password"
      description={`Choose a new password for ${session.email}.`}
      footer={
        <p>
          Changed your mind? <AuthLink href="/dashboard">Go to your dashboard</AuthLink>
        </p>
      }
    >
      <ResetPasswordForm />
    </AuthCard>
  )
}
