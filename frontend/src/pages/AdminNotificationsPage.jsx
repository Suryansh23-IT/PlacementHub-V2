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
import { listAdminNotifications, listAdminSentNotificationPage, listAdminSentNotifications, markAdminNotificationRead, previewAdminExplorerNotification, sendAdminCompanyNotification, sendAdminExplorerNotification, sendAdminStudentNotification } from '../services/admin-notification.service.js'
import { listAdminPublishedDriveMonitoring } from '../services/placement-drive.service.js'

const blankStudentForm = { audience: 'all_verified', placementDriveId: '', title: '', message: '' }
const blankCompanyForm = { companyUserId: '', title: '', message: '' }
const blankExplorerForm = { target: 'all', branch: '', drive: '', phase: '', studentIds: '', title: '', message: '' }
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
  const [explorerForm, setExplorerForm] = useState(blankExplorerForm); const [explorerPreview, setExplorerPreview] = useState(null); const [previewing, setPreviewing] = useState(false)
  const [historyFilters, setHistoryFilters] = useState({ search: '', category: 'all', drive: '', phase: '', targetType: '', dateFrom: '', dateTo: '', page: 1, limit: 25 }); const [history, setHistory] = useState(null)

  useEffect(() => {
    let active = true
    Promise.all([listAdminNotifications(session.accessToken), listAdminSentNotifications(session.accessToken), listAdminPublishedDriveMonitoring(session.accessToken), getCompanies(session.accessToken)])
      .then(([notificationResponse, sentResponse, driveResponse, companyResponse]) => { if (active) { setNotifications(notificationResponse.data); setSentNotifications(sentResponse.data); setDrives(driveResponse.data); setCompanies(companyResponse.data) } })
      .catch(error => { if (active) setError(error.message) })
    return () => { active = false }
  }, [session.accessToken])
  useEffect(() => { if (tab !== 'sent') return; let active = true; listAdminSentNotificationPage(session.accessToken, historyFilters).then(({ data }) => active && setHistory(data)).catch(error => active && setError(error.message)); return () => { active = false } }, [session.accessToken, tab, historyFilters])

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
  const targetFilters = () => ({ ...(explorerForm.target === 'eligible' ? { collegeEligibility: 'eligible' } : explorerForm.target === 'unplaced' ? { collegeEligibility: 'eligible', placementStatus: 'unplaced_eligible' } : explorerForm.target === 'placed' ? { placementStatus: 'placed' } : explorerForm.target === 'branch' ? { branch: explorerForm.branch } : explorerForm.target === 'drive' ? { drive: explorerForm.drive } : explorerForm.target === 'phase' ? { drive: explorerForm.drive, phase: explorerForm.phase } : explorerForm.target === 'selected' ? { drive: explorerForm.drive, applicationStatus: 'selected_pending_confirmation' } : {}) })
  const explorerPayload = includeMessage => ({ mode: explorerForm.target === 'specific' ? 'selected' : 'all_matching', ...(explorerForm.target === 'specific' ? { selectedStudentIds: explorerForm.studentIds.split(/[\s,]+/).filter(Boolean) } : { filters: targetFilters() }), requestId: crypto.randomUUID(), ...(includeMessage ? { title: explorerForm.title, message: explorerForm.message } : { title: 'Preview', message: 'Preview recipients' }) })
  async function previewExplorer() { setPreviewing(true); setError(''); try { setExplorerPreview((await previewAdminExplorerNotification(session.accessToken, explorerPayload(false))).data) } catch (error) { setError(error.message); setExplorerPreview(null) } finally { setPreviewing(false) } }
  async function sendExplorer(event) { event.preventDefault(); if (!explorerPreview?.recipientCount || sending) return; setSending('explorer'); try { const { data } = await sendAdminExplorerNotification(session.accessToken, explorerPayload(true)); setSuccess(`Notification sent to ${data.recipientCount} recipients.`); setExplorerForm(blankExplorerForm); setExplorerPreview(null); setSentNotifications((await listAdminSentNotifications(session.accessToken)).data) } catch (error) { setError(error.message) } finally { setSending('') } }

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
      <form className="rounded-2xl border border-blue-200 bg-blue-50 p-5" onSubmit={sendExplorer}><h2 className="font-bold text-blue-950">Send Notification</h2><p className="mt-1 text-sm text-blue-900">Recipients are resolved from the Student Explorer on the server.</p><div className="mt-4 grid gap-4"><FormField as="select" label="Target" value={explorerForm.target} onChange={event => { setExplorerPreview(null); setExplorerForm(current => ({ ...current, target: event.target.value })) }}><option value="all">All Students</option><option value="eligible">College Eligible</option><option value="unplaced">Unplaced Eligible</option><option value="placed">Placed</option><option value="branch">Branch</option><option value="drive">Drive Applicants</option><option value="phase">Current Phase</option><option value="selected">Selected Candidates</option><option value="specific">Specific Students</option></FormField>{explorerForm.target === 'branch' && <FormField required label="Branch" value={explorerForm.branch} onChange={event => setExplorerForm(current => ({ ...current, branch: event.target.value }))} />}{['drive', 'phase', 'selected'].includes(explorerForm.target) && <FormField as="select" required label="Drive" value={explorerForm.drive} onChange={event => setExplorerForm(current => ({ ...current, drive: event.target.value }))}><option value="">Select a drive</option>{drives.map(drive => <option key={drive._id} value={drive._id}>{drive.company?.companyName || 'Company'} · {drive.role?.title || 'Drive'}</option>)}</FormField>}{explorerForm.target === 'phase' && <FormField type="number" required min="0" max="5" label="Current phase" value={explorerForm.phase} onChange={event => setExplorerForm(current => ({ ...current, phase: event.target.value }))} />}{explorerForm.target === 'specific' && <FormField as="textarea" required rows="2" label="Student IDs from Explorer selection" placeholder="Paste selected Student IDs, comma-separated" value={explorerForm.studentIds} onChange={event => setExplorerForm(current => ({ ...current, studentIds: event.target.value }))} />}<Button type="button" onClick={previewExplorer} disabled={previewing}>{previewing ? 'Resolving…' : 'Preview Recipients'}</Button>{explorerPreview && <p className="rounded-xl bg-white p-3 text-sm font-bold text-blue-900">{explorerPreview.recipientCount} server-resolved recipient{explorerPreview.recipientCount === 1 ? '' : 's'}</p>}<FormField required label="Title" value={explorerForm.title} onChange={event => setExplorerForm(current => ({ ...current, title: event.target.value }))} /><FormField as="textarea" required rows="4" label="Message" value={explorerForm.message} onChange={event => setExplorerForm(current => ({ ...current, message: event.target.value }))} /><div className="flex gap-3"><Button type="submit" disabled={!explorerPreview?.recipientCount || !explorerForm.title.trim() || !explorerForm.message.trim() || Boolean(sending)}>{sending === 'explorer' ? 'Sending…' : 'Send Notification'}</Button><Button type="button" variant="quiet" onClick={() => { setExplorerForm(blankExplorerForm); setExplorerPreview(null) }}>Cancel</Button></div></div></form>
      <form className="rounded-2xl border border-blue-200 bg-blue-50 p-5" onSubmit={sendStudents}><h2 className="font-bold text-blue-950">Notify Students</h2><p className="mt-1 text-sm text-blue-900">Use only for meaningful placement updates. Publishing a drive already notifies eligible Students automatically.</p><div className="mt-4 grid gap-4"><FormField as="select" label="Audience" value={studentForm.audience} onChange={event => setStudentForm(current => ({ ...current, audience: event.target.value, placementDriveId: '' }))}><option value="all_verified">All verified Students</option><option value="eligible_drive">Eligible Students of a published Drive</option><option value="drive_applicants">Applicants of a published Drive</option></FormField>{requiresDrive && <FormField as="select" required label="Published Placement Drive" value={studentForm.placementDriveId} onChange={event => setStudentForm(current => ({ ...current, placementDriveId: event.target.value }))}><option value="">Select a drive</option>{drives.map(drive => <option key={drive._id} value={drive._id}>{drive.company?.companyName || 'Company'} · {drive.role?.title || 'Placement Drive'}</option>)}</FormField>}<FormField required label="Title" value={studentForm.title} onChange={event => setStudentForm(current => ({ ...current, title: event.target.value }))} /><FormField as="textarea" required rows="4" label="Message" maxLength={1500} value={studentForm.message} onChange={event => setStudentForm(current => ({ ...current, message: event.target.value }))} /></div><div className="mt-4"><Button type="submit" disabled={Boolean(sending)}>{sending === 'students' ? 'Sending…' : 'Send'}</Button></div></form>
      <form className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" onSubmit={sendCompany}><h2 className="font-bold text-slate-950">Notify an approved Company</h2><p className="mt-1 text-sm text-slate-600">Send a direct placement-related update to one approved Company account.</p><div className="mt-4 grid gap-4"><FormField as="select" required label="Company" value={companyForm.companyUserId} onChange={event => setCompanyForm(current => ({ ...current, companyUserId: event.target.value }))}><option value="">Select an approved Company</option>{approvedCompanies.map(item => <option key={item._id} value={item._id}>{item.company?.companyName || item.name}</option>)}</FormField><FormField required label="Title" value={companyForm.title} onChange={event => setCompanyForm(current => ({ ...current, title: event.target.value }))} /><FormField as="textarea" required rows="4" label="Message" maxLength={1500} value={companyForm.message} onChange={event => setCompanyForm(current => ({ ...current, message: event.target.value }))} /></div><div className="mt-4"><Button type="submit" disabled={Boolean(sending)}>{sending === 'company' ? 'Sending…' : 'Send'}</Button></div></form>
    </div>
    {success && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{success}</p>}
    {error && <ErrorState message={error} />}
    <AdminHistory filters={historyFilters} setFilters={setHistoryFilters} history={history} drives={drives} />
    </>}
    {tab === 'received' && <>{error && <ErrorState message={error} />}<NotificationInbox notifications={notifications} drives={drives} busyId={busyId} onMarkRead={markRead} driveTo={driveId => `/admin/placement-drives/${driveId}/monitoring`} emptyTitle="No received notifications" emptyDescription="Company messages and placement updates will appear here when action is needed." /></>}
  </section>
}

function AdminHistory({ filters, setFilters, history, drives }) { const change = (key, value) => setFilters(current => ({ ...current, [key]: value, page: 1 })); if (!history) return <LoadingState message="Loading sent history…" />; if (!history.records.length) return <p className="rounded-xl border bg-white p-4 text-sm text-slate-600">No sent notifications match these filters.</p>; const first = (history.page - 1) * history.limit + 1; return <><div className="flex flex-wrap gap-2 rounded-xl border bg-white p-3"><input className="rounded border p-2" placeholder="Search sent" value={filters.search} onChange={event => change('search', event.target.value)} /><select className="rounded border p-2" value={filters.category} onChange={event => change('category', event.target.value)}><option value="all">All categories</option><option value="manual_placement_message">Placement messages</option></select><select className="rounded border p-2" value={filters.drive} onChange={event => change('drive', event.target.value)}><option value="">All drives</option>{drives.map(drive => <option key={drive._id} value={drive._id}>{drive.role?.title || 'Drive'}</option>)}</select><input className="w-24 rounded border p-2" placeholder="Phase" value={filters.phase} onChange={event => change('phase', event.target.value)} /><input className="rounded border p-2" placeholder="Target type" value={filters.targetType} onChange={event => change('targetType', event.target.value)} /><input type="date" className="rounded border p-2" value={filters.dateFrom} onChange={event => change('dateFrom', event.target.value)} /><input type="date" className="rounded border p-2" value={filters.dateTo} onChange={event => change('dateTo', event.target.value)} /><select className="rounded border p-2" value={filters.limit} onChange={event => change('limit', Number(event.target.value))}><option value="25">25</option><option value="50">50</option><option value="100">100</option></select><button onClick={() => setFilters({ search: '', category: 'all', drive: '', phase: '', targetType: '', dateFrom: '', dateTo: '', page: 1, limit: 25 })}>Clear filters</button></div><div className="mt-3 overflow-x-auto rounded-xl border bg-white"><table className="min-w-full text-sm"><thead><tr className="bg-slate-50 text-left"><th className="p-3">Sent At</th><th className="p-3">Title</th><th className="p-3">Category</th><th className="p-3">Target</th><th className="p-3">Recipients</th></tr></thead><tbody>{history.records.map(item => <tr key={item._id} className="border-t"><td className="p-3">{new Date(item.createdAt).toLocaleString()}</td><td className="p-3"><strong>{item.title}</strong><p className="text-slate-500">{item.message}</p></td><td className="p-3">{item.category}</td><td className="p-3">{item.phaseNumber ? `Phase ${item.phaseNumber} · ` : ''}{item.context?.audience || '—'}</td><td className="p-3">{item.recipientCount}</td></tr>)}</tbody></table><div className="flex items-center justify-between p-3"><button disabled={history.page === 1} onClick={() => setFilters(current => ({ ...current, page: current.page - 1 }))}>Previous</button><span>Showing {first}–{Math.min(first + history.records.length - 1, history.totalRecords)} of {history.totalRecords}</span><button disabled={history.page === history.totalPages} onClick={() => setFilters(current => ({ ...current, page: current.page + 1 }))}>Next</button></div></div></> }

function NotificationTabs({ tab, setTab }) {
  return <div className="flex w-fit rounded-xl border border-slate-200 bg-slate-50 p-1" role="tablist" aria-label="Notification history"><Tab active={tab === 'received'} onClick={() => setTab('received')}>Received</Tab><Tab active={tab === 'sent'} onClick={() => setTab('sent')}>Sent</Tab></div>
}

function Tab({ active, onClick, children }) {
  return <button type="button" role="tab" aria-selected={active} className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${active ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-600 hover:text-slate-950'}`} onClick={onClick}>{children}</button>
}
