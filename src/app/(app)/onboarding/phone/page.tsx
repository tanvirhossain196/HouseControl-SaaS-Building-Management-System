import Link from 'next/link'
import { redirect } from 'next/navigation'
import { pageMetadata } from '@/lib/seo'
import { requireSession } from '@/lib/auth/session'
import { AuthCard } from '@/components/auth/auth-card'
import { PhoneVerification } from '@/components/auth/phone-verification'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'

export const metadata = pageMetadata({
  title: 'Verify your mobile number',
  description:
    'Confirm the number HouseControl uses for role handovers and urgent alerts.',
  path: '/onboarding/phone',
  noIndex: true,
})

export default async function VerifyPhonePage({
  searchParams,
}: {
  searchParams: { next?: string }
}) {
  const session = await requireSession('/onboarding/phone')
  const next = searchParams.next?.startsWith('/') ? searchParams.next : '/dashboard'

  if (session.isPhoneVerified && !searchParams.next) {
    redirect('/dashboard')
  }

  return (
    <div className="mx-auto w-full max-w-md px-5 py-12">
      {session.isPhoneVerified ? (
        <AuthCard
          title="Your number is verified"
          description={`Codes for role handovers go to ${session.profile?.phone}.`}
        >
          <div className="space-y-5">
            <Badge tone="paid" dot>
              Verified
            </Badge>
            <Link href="/dashboard" className={buttonVariants({ block: true })}>
              Back to dashboard
            </Link>
          </div>
        </AuthCard>
      ) : (
        <AuthCard
          title="Verify your mobile number"
          description="One code by SMS. This number is what a moderator handover is confirmed against, so it has to be yours."
          footer={
            <p>
              Not now?{' '}
              <Link href={next} className="font-medium text-primary hover:underline">
                Skip this
              </Link>{' '}
              — everything except moderating a flat works without it.
            </p>
          }
        >
          <PhoneVerification next={next} />
        </AuthCard>
      )}
    </div>
  )
}
