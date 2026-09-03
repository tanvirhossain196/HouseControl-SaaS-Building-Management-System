import { pageMetadata } from '@/lib/seo'
import { requireSession } from '@/lib/auth/session'
import { listPreferences } from '@/services/notifications.service'
import { CATEGORY_LABELS, type Category } from '@/lib/notifications'
import { PageHeader } from '@/components/layout/page-header'
import { PreferenceForm } from '@/components/notifications/preference-form'

export const metadata = pageMetadata({
  title: 'Notifications',
  description: 'Choose what you are told about, and how.',
  path: '/settings/notifications',
  noIndex: true,
})

/** Account and money notifications are mandatory; the rest are the person's call. */
const LOCKED: Category[] = ['account']

export default async function NotificationSettingsPage() {
  const session = await requireSession('/settings/notifications')
  const stored = await listPreferences().catch(() => [])

  const categories = (Object.keys(CATEGORY_LABELS) as Category[]).map((key) => {
    const saved = stored.find((row) => row.event === `category:${key}`)
    return {
      key,
      locked: LOCKED.includes(key),
      current: {
        email: saved?.email ?? true,
        sms: saved?.sms ?? key === 'money',
        push: saved?.push ?? true,
      },
    }
  })

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Nothing is sent between 10pm and 8am except what cannot wait — a visitor at your gate, a handover code, a security change."
      />

      <div className="max-w-3xl">
        <PreferenceForm categories={categories} smsAvailable={session.isPhoneVerified} />

        <p className="mt-6 max-w-[62ch] text-sm text-muted">
          {session.isPhoneVerified
            ? 'SMS is used sparingly — overdue rent, a handover code, a visitor at the gate — because each one costs the building money.'
            : 'Verify your mobile number to receive anything by SMS.'}
        </p>
      </div>
    </>
  )
}
