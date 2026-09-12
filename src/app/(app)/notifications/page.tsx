import { pageMetadata } from '@/lib/seo'
import { requireSession } from '@/lib/auth/session'
import { listNotifications } from '@/services/notifications.service'
import { PageHeader } from '@/components/layout/page-header'
import { NotificationList } from '@/components/notifications/notification-list'

export const metadata = pageMetadata({
  title: 'Notifications',
  description: 'Everything HouseControl has told you.',
  path: '/notifications',
  noIndex: true,
})

/**
 * The full history, where the bell only holds the last few.
 *
 * Deliberately separate from /settings/notifications. That page answers "what
 * should reach me"; this one answers "what already did". Folding them together
 * means somebody looking for a receipt they were told about has to walk past
 * a wall of toggles to find it.
 */
export default async function NotificationsPage() {
  await requireSession('/notifications')

  const notifications = await listNotifications(100).catch(() => [])

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Everything sent to you, newest first. Opening one marks it read and takes you to what it is about."
      />

      <div className="mt-6">
        <NotificationList notifications={notifications} />
      </div>
    </>
  )
}
