import { useEffect, useState } from 'react'
import { ErrorState } from '../components/feedback/ErrorState.jsx'
import { LoadingState } from '../components/feedback/LoadingState.jsx'
import { NotificationInbox } from '../components/notifications/NotificationInbox.jsx'
import { PageHeader } from '../components/ui/PageHeader.jsx'
import { StatusBadge } from '../components/ui/StatusBadge.jsx'
import { useAuth } from '../features/auth/useAuth.js'
import { listStudentNotificationPage, markAllStudentNotificationsRead, markStudentNotificationRead } from '../services/student-notification.service.js'
import { listStudentPlacementDrives } from '../services/student-placement-drive.service.js'

export function StudentNotificationsPage() {
  const { session } = useAuth()
  const [notifications, setNotifications] = useState(null)
  const [filters, setFilters] = useState({ state: 'all', category: 'all', search: '', page: 1 })
  const [drives, setDrives] = useState([])
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')

  useEffect(() => {
    let active = true
    listStudentNotificationPage(session.accessToken, filters).then(({ data }) => { if (active) setNotifications(data) }).catch(error => { if (active) setError(error.message) })
    listStudentPlacementDrives(session.accessToken).then(({ data }) => { if (active) setDrives(data) }).catch(() => { if (active) setDrives([]) })
    return () => { active = false }
  }, [session.accessToken, filters])

  async function markRead(notification) {
    if (notification.isRead || busyId) return
    setBusyId(notification._id)
    setError('')
    try {
      const { data } = await markStudentNotificationRead(session.accessToken, notification._id)
      setNotifications(current => ({ ...current, unreadCount: Math.max(0, current.unreadCount - 1), records: current.records.map(item => item._id === notification._id ? { ...item, ...data } : item) }))
    } catch (error) { setError(error.message) } finally { setBusyId('') }
  }

  if (error && !notifications) return <ErrorState message={error} />
  if (!notifications) return <LoadingState message="Loading notifications…" />
  const unread = notifications.unreadCount
  return <section className="space-y-6">
    <PageHeader eyebrow="Student Placement Portal" title="Notifications" description="Updates about published opportunities and your placement activity." action={<StatusBadge status="neutral">{unread} unread</StatusBadge>} />
    {error && <ErrorState message={error} />}
    <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-3"><select value={filters.state} onChange={event => setFilters(current => ({ ...current, state: event.target.value, page: 1 }))} className="rounded-lg border p-2"><option value="all">All</option><option value="unread">Unread</option><option value="read">Read</option></select><select value={filters.category} onChange={event => setFilters(current => ({ ...current, category: event.target.value, page: 1 }))} className="rounded-lg border p-2"><option value="all">All categories</option><option value="recruitment">Recruitment / Drive</option><option value="placement">Placement</option><option value="system">System</option></select><input className="min-w-48 flex-1 rounded-lg border p-2" placeholder="Search notifications" value={filters.search} onChange={event => setFilters(current => ({ ...current, search: event.target.value, page: 1 }))} /><button className="rounded-lg border px-3 py-2 text-sm font-bold" disabled={!unread} onClick={async () => { await markAllStudentNotificationsRead(session.accessToken); setFilters(current => ({ ...current })) }}>Mark all read</button></div>
    <NotificationInbox notifications={notifications.records} drives={drives} busyId={busyId} onMarkRead={markRead} driveTo={driveId => `/student/placement/${driveId}`} journeyTo={applicationId => `/student/applications/${applicationId}/journey`} emptyTitle="No notifications match these filters" emptyDescription="Placement updates will appear here when there is something for you to review." />
    {notifications.totalPages > 1 && <div className="flex items-center justify-between"><button disabled={filters.page === 1} onClick={() => setFilters(current => ({ ...current, page: current.page - 1 }))}>Previous</button><span className="text-sm">Page {notifications.page} of {notifications.totalPages}</span><button disabled={filters.page === notifications.totalPages} onClick={() => setFilters(current => ({ ...current, page: current.page + 1 }))}>Next</button></div>}
  </section>
}
