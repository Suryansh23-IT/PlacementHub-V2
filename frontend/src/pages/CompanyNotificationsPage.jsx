import { useEffect, useState } from 'react'
import { ErrorState } from '../components/feedback/ErrorState.jsx'
import { LoadingState } from '../components/feedback/LoadingState.jsx'
import { NotificationInbox } from '../components/notifications/NotificationInbox.jsx'
import { Button } from '../components/ui/Button.jsx'
import { FormField } from '../components/ui/FormField.jsx'
import { PageHeader } from '../components/ui/PageHeader.jsx'
import { StatusBadge } from '../components/ui/StatusBadge.jsx'
import { useAuth } from '../features/auth/useAuth.js'
import { getMyCompany } from '../services/company.service.js'
import { listCompanyNotifications, listCompanySentNotifications, markCompanyNotificationRead, sendCompanyAdminNotification } from '../services/company-notification.service.js'
import { listMyPlacementDrives } from '../services/placement-drive.service.js'

const blank = { title: '', message: '', placementDriveId: '' }
export function CompanyNotificationsPage() {
  const { session } = useAuth()
  const [notifications, setNotifications] = useState(null)
  const [sentNotifications, setSentNotifications] = useState(null)
  const [drives, setDrives] = useState([])
  const [companyName, setCompanyName] = useState('')
  const [form, setForm] = useState(blank)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [sending, setSending] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [tab, setTab] = useState('received')

  useEffect(() => {
    let active = true
    Promise.all([listCompanyNotifications(session.accessToken), listCompanySentNotifications(session.accessToken), listMyPlacementDrives(session.accessToken)])
      .then(([notificationResponse, sentResponse, driveResponse]) => { if (active) { setNotifications(notificationResponse.data); setSentNotifications(sentResponse.data); setDrives(driveResponse.data) } })
      .catch(error => { if (active) setError(error.message) })
    getMyCompany(session.accessToken).then(({ data }) => { if (active) setCompanyName(data.companyName || '') }).catch(() => { if (active) setCompanyName('') })
    return () => { active = false }
  }, [session.accessToken])

  async function send(event) {
    event.preventDefault()
    if (sending) return
    setSending(true); setError(''); setSuccess('')
    try {
      await sendCompanyAdminNotification(session.accessToken, { title: form.title, message: form.message, ...(form.placementDriveId ? { placementDriveId: form.placementDriveId } : {}) })
      const sentResponse = await listCompanySentNotifications(session.accessToken)
      setSentNotifications(sentResponse.data)
      setForm(blank)
      setSuccess('Your message was sent to the Placement Admin.')
    } catch (error) { setError(error.message) } finally { setSending(false) }
  }

  async function markRead(notification) {
    if (notification.isRead || busyId) return
    setBusyId(notification._id); setError('')
    try { const { data } = await markCompanyNotificationRead(session.accessToken, notification._id); setNotifications(current => current.map(item => item._id === notification._id ? { ...item, ...data } : item)) } catch (error) { setError(error.message) } finally { setBusyId('') }
  }

  if (error && (!notifications || !sentNotifications)) return <ErrorState message={error} />
  if (!notifications || !sentNotifications) return <LoadingState message="Loading Company notifications…" />
  const unread = notifications.filter(notification => !notification.isRead).length
  return <section className="space-y-6">
    <PageHeader eyebrow="Campus Recruitment Portal" title="Notifications" description="Receive Placement Cell updates and send important placement-related messages to the Placement Admin." action={<StatusBadge status="neutral">{unread} unread</StatusBadge>} />
    <NotificationTabs tab={tab} setTab={setTab} />
    {tab === 'sent' && <>
    <form className="rounded-2xl border border-violet-200 bg-violet-50 p-5" onSubmit={send}><h2 className="font-bold text-violet-950">Message Placement Admin</h2><p className="mt-1 text-sm text-violet-900">Use this for important placement-related communication. Student messaging is managed by the Placement Cell.</p><div className="mt-4 grid gap-4 sm:grid-cols-2"><FormField required label="Title" value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} /><FormField as="select" label="Related Placement Drive (optional)" value={form.placementDriveId} onChange={event => setForm(current => ({ ...current, placementDriveId: event.target.value }))}><option value="">No related drive</option>{drives.map(drive => <option key={drive._id} value={drive._id}>{drive.role?.title || 'Placement Drive'}</option>)}</FormField><FormField as="textarea" required className="sm:col-span-2" rows="4" label="Message" maxLength={1500} value={form.message} onChange={event => setForm(current => ({ ...current, message: event.target.value }))} /></div><div className="mt-4"><Button type="submit" disabled={sending}>{sending ? 'Sending…' : 'Send message'}</Button></div></form>
    {success && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{success}</p>}
    {error && <ErrorState message={error} />}
    <NotificationInbox notifications={sentNotifications} drives={drives} driveTo={driveId => `/company/placement-drives/${driveId}`} fallbackCompanyName={companyName} mode="sent" emptyTitle="No sent notifications" emptyDescription="Messages you send to Placement Administration will appear here." />
    </>}
    {tab === 'received' && <>{error && <ErrorState message={error} />}<NotificationInbox notifications={notifications} drives={drives} busyId={busyId} onMarkRead={markRead} driveTo={driveId => `/company/placement-drives/${driveId}`} fallbackCompanyName={companyName} emptyTitle="No received notifications" emptyDescription="Placement Cell updates will appear here when action is needed." /></>}
  </section>
}

function NotificationTabs({ tab, setTab }) {
  return <div className="flex w-fit rounded-xl border border-slate-200 bg-slate-50 p-1" role="tablist" aria-label="Notification history"><Tab active={tab === 'received'} onClick={() => setTab('received')}>Received</Tab><Tab active={tab === 'sent'} onClick={() => setTab('sent')}>Sent</Tab></div>
}

function Tab({ active, onClick, children }) {
  return <button type="button" role="tab" aria-selected={active} className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${active ? 'bg-white text-violet-800 shadow-sm' : 'text-slate-600 hover:text-slate-950'}`} onClick={onClick}>{children}</button>
}
