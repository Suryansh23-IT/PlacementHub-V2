import { useEffect, useState } from 'react'
import { ErrorState } from '../components/feedback/ErrorState.jsx'
import { LoadingState } from '../components/feedback/LoadingState.jsx'
import { NotificationInbox } from '../components/notifications/NotificationInbox.jsx'
import { Button } from '../components/ui/Button.jsx'
import { FormField } from '../components/ui/FormField.jsx'
import { PageHeader } from '../components/ui/PageHeader.jsx'
import { StatusBadge } from '../components/ui/StatusBadge.jsx'
import { useAuth } from '../features/auth/useAuth.js'
import { getCompanies } from '../services/company.service.js'
import { listAdminNotifications, listAdminSentNotifications, markAdminNotificationRead, sendAdminCompanyNotification, sendAdminStudentNotification } from '../services/admin-notification.service.js'
import { listAdminPublishedDriveMonitoring } from '../services/placement-drive.service.js'

const blankStudentForm = { audience: 'all_verified', placementDriveId: '', title: '', message: '' }
const blankCompanyForm = { companyUserId: '', title: '', message: '' }
export function AdminNotificationsPage() {
  const { session } = useAuth()
  const [notifications, setNotifications] = useState(null)
  const [sentNotifications, setSentNotifications] = useState(null)
  const [drives, setDrives] = useState([])
  const [companies, setCompanies] = useState([])
  const [studentForm, setStudentForm] = useState(blankStudentForm)
  const [companyForm, setCompanyForm] = useState(blankCompanyForm)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [sending, setSending] = useState('')
  const [busyId, setBusyId] = useState('')
  const [tab, setTab] = useState('received')

  useEffect(() => {
    let active = true
    Promise.all([listAdminNotifications(session.accessToken), listAdminSentNotifications(session.accessToken), listAdminPublishedDriveMonitoring(session.accessToken), getCompanies(session.accessToken)])
      .then(([notificationResponse, sentResponse, driveResponse, companyResponse]) => { if (active) { setNotifications(notificationResponse.data); setSentNotifications(sentResponse.data); setDrives(driveResponse.data); setCompanies(companyResponse.data) } })
      .catch(error => { if (active) setError(error.message) })
    return () => { active = false }
  }, [session.accessToken])

  async function sendStudents(event) {
    event.preventDefault()
    if (sending) return
    setSending('students'); setError(''); setSuccess('')
    try {
      const { data } = await sendAdminStudentNotification(session.accessToken, { audience: studentForm.audience, title: studentForm.title, message: studentForm.message, ...(studentForm.audience === 'all_verified' ? {} : { placementDriveId: studentForm.placementDriveId }) })
      const sentResponse = await listAdminSentNotifications(session.accessToken)
      setSentNotifications(sentResponse.data)
      setStudentForm(blankStudentForm)
      setSuccess(`Student notification sent to ${data.notificationsCreated} recipient${data.notificationsCreated === 1 ? '' : 's'}.`)
    } catch (error) { setError(error.message) } finally { setSending('') }
  }

  async function sendCompany(event) {
    event.preventDefault()
    if (sending) return
    setSending('company'); setError(''); setSuccess('')
    try {
      await sendAdminCompanyNotification(session.accessToken, companyForm.companyUserId, { title: companyForm.title, message: companyForm.message })
      const sentResponse = await listAdminSentNotifications(session.accessToken)
      setSentNotifications(sentResponse.data)
      setCompanyForm(blankCompanyForm)
      setSuccess('Company notification sent.')
    } catch (error) { setError(error.message) } finally { setSending('') }
  }

  async function markRead(notification) {
    if (notification.isRead || busyId) return
    setBusyId(notification._id); setError('')
    try { const { data } = await markAdminNotificationRead(session.accessToken, notification._id); setNotifications(current => current.map(item => item._id === notification._id ? { ...item, ...data } : item)) } catch (error) { setError(error.message) } finally { setBusyId('') }
  }

  if (error && (!notifications || !sentNotifications)) return <ErrorState message={error} />
  if (!notifications || !sentNotifications) return <LoadingState message="Loading Placement Admin notifications…" />
  const unread = notifications.filter(notification => !notification.isRead).length
  const approvedCompanies = companies.filter(item => item.company?.approvalStatus === 'approved')
  const requiresDrive = studentForm.audience !== 'all_verified'
  return <section className="space-y-6">
    <PageHeader eyebrow="Career Development Centre" title="Notifications" description="Send concise placement updates and receive important Company messages." action={<StatusBadge status="neutral">{unread} unread</StatusBadge>} />
    <NotificationTabs tab={tab} setTab={setTab} />
    {tab === 'sent' && <>
    <div className="grid gap-6 xl:grid-cols-2">
      <form className="rounded-2xl border border-violet-200 bg-violet-50 p-5" onSubmit={sendStudents}><h2 className="font-bold text-violet-950">Notify Students</h2><p className="mt-1 text-sm text-violet-900">Use only for meaningful placement updates. Publishing a drive already notifies eligible Students automatically.</p><div className="mt-4 grid gap-4"><FormField as="select" label="Audience" value={studentForm.audience} onChange={event => setStudentForm(current => ({ ...current, audience: event.target.value, placementDriveId: '' }))}><option value="all_verified">All verified Students</option><option value="eligible_drive">Eligible Students of a published Drive</option><option value="drive_applicants">Applicants of a published Drive</option></FormField>{requiresDrive && <FormField as="select" required label="Published Placement Drive" value={studentForm.placementDriveId} onChange={event => setStudentForm(current => ({ ...current, placementDriveId: event.target.value }))}><option value="">Select a drive</option>{drives.map(drive => <option key={drive._id} value={drive._id}>{drive.company?.companyName || 'Company'} · {drive.role?.title || 'Placement Drive'}</option>)}</FormField>}<FormField required label="Title" value={studentForm.title} onChange={event => setStudentForm(current => ({ ...current, title: event.target.value }))} /><FormField as="textarea" required rows="4" label="Message" maxLength={1500} value={studentForm.message} onChange={event => setStudentForm(current => ({ ...current, message: event.target.value }))} /></div><div className="mt-4"><Button type="submit" disabled={Boolean(sending)}>{sending === 'students' ? 'Sending…' : 'Send'}</Button></div></form>
      <form className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" onSubmit={sendCompany}><h2 className="font-bold text-slate-950">Notify an approved Company</h2><p className="mt-1 text-sm text-slate-600">Send a direct placement-related update to one approved Company account.</p><div className="mt-4 grid gap-4"><FormField as="select" required label="Company" value={companyForm.companyUserId} onChange={event => setCompanyForm(current => ({ ...current, companyUserId: event.target.value }))}><option value="">Select an approved Company</option>{approvedCompanies.map(item => <option key={item._id} value={item._id}>{item.company?.companyName || item.name}</option>)}</FormField><FormField required label="Title" value={companyForm.title} onChange={event => setCompanyForm(current => ({ ...current, title: event.target.value }))} /><FormField as="textarea" required rows="4" label="Message" maxLength={1500} value={companyForm.message} onChange={event => setCompanyForm(current => ({ ...current, message: event.target.value }))} /></div><div className="mt-4"><Button type="submit" disabled={Boolean(sending)}>{sending === 'company' ? 'Sending…' : 'Send'}</Button></div></form>
    </div>
    {success && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{success}</p>}
    {error && <ErrorState message={error} />}
    <NotificationInbox notifications={sentNotifications} drives={drives} driveTo={driveId => `/admin/placement-drives/${driveId}/monitoring`} mode="sent" emptyTitle="No sent notifications" emptyDescription="Messages you send to Students or Companies will appear here." />
    </>}
    {tab === 'received' && <>{error && <ErrorState message={error} />}<NotificationInbox notifications={notifications} drives={drives} busyId={busyId} onMarkRead={markRead} driveTo={driveId => `/admin/placement-drives/${driveId}/monitoring`} emptyTitle="No received notifications" emptyDescription="Company messages and placement updates will appear here when action is needed." /></>}
  </section>
}

function NotificationTabs({ tab, setTab }) {
  return <div className="flex w-fit rounded-xl border border-slate-200 bg-slate-50 p-1" role="tablist" aria-label="Notification history"><Tab active={tab === 'received'} onClick={() => setTab('received')}>Received</Tab><Tab active={tab === 'sent'} onClick={() => setTab('sent')}>Sent</Tab></div>
}

function Tab({ active, onClick, children }) {
  return <button type="button" role="tab" aria-selected={active} className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${active ? 'bg-white text-violet-800 shadow-sm' : 'text-slate-600 hover:text-slate-950'}`} onClick={onClick}>{children}</button>
}
