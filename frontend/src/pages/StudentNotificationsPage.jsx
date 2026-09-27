import { useEffect, useState } from 'react'
import { ErrorState } from '../components/feedback/ErrorState.jsx'
import { LoadingState } from '../components/feedback/LoadingState.jsx'
import { NotificationInbox } from '../components/notifications/NotificationInbox.jsx'
import { PageHeader } from '../components/ui/PageHeader.jsx'
import { StatusBadge } from '../components/ui/StatusBadge.jsx'
import { useAuth } from '../features/auth/useAuth.js'
import { listStudentNotifications, markStudentNotificationRead } from '../services/student-notification.service.js'
import { listStudentPlacementDrives } from '../services/student-placement-drive.service.js'

export function StudentNotificationsPage() {
  const { session } = useAuth()
  const [notifications, setNotifications] = useState(null)
  const [drives, setDrives] = useState([])
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')

  useEffect(() => {
    let active = true
    listStudentNotifications(session.accessToken).then(({ data }) => { if (active) setNotifications(data) }).catch(error => { if (active) setError(error.message) })
    listStudentPlacementDrives(session.accessToken).then(({ data }) => { if (active) setDrives(data) }).catch(() => { if (active) setDrives([]) })
    return () => { active = false }
  }, [session.accessToken])

  async function markRead(notification) {
    if (notification.isRead || busyId) return
    setBusyId(notification._id)
    setError('')
    try {
      const { data } = await markStudentNotificationRead(session.accessToken, notification._id)
      setNotifications(current => current.map(item => item._id === notification._id ? { ...item, ...data } : item))
    } catch (error) { setError(error.message) } finally { setBusyId('') }
  }

  if (error && !notifications) return <ErrorState message={error} />
  if (!notifications) return <LoadingState message="Loading notifications…" />
  const unread = notifications.filter(notification => !notification.isRead).length
  return <section className="space-y-6">
    <PageHeader eyebrow="Student Placement Portal" title="Notifications" description="Updates about published opportunities and your placement activity." action={<StatusBadge status="neutral">{unread} unread</StatusBadge>} />
    {error && <ErrorState message={error} />}
    <NotificationInbox notifications={notifications} drives={drives} busyId={busyId} onMarkRead={markRead} driveTo={driveId => `/student/placement/${driveId}`} journeyTo={applicationId => `/student/applications/${applicationId}/journey`} emptyTitle="No unread notifications" emptyDescription="Placement updates will appear here when there is something for you to review." />
  </section>
}
