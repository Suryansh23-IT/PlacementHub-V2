import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EmptyState } from '../components/feedback/EmptyState.jsx'
import { ErrorState } from '../components/feedback/ErrorState.jsx'
import { LoadingState } from '../components/feedback/LoadingState.jsx'
import { Button } from '../components/ui/Button.jsx'
import { FormField } from '../components/ui/FormField.jsx'
import { DriveContextHeader } from '../components/placement-drives/DriveContextHeader.jsx'
import { DriveMessageComposer } from '../components/notifications/DriveMessageComposer.jsx'
import { PageHeader } from '../components/ui/PageHeader.jsx'
import { StatusBadge } from '../components/ui/StatusBadge.jsx'
import { useAuth } from '../features/auth/useAuth.js'
import { sendAdminCompanyNotification, sendAdminStudentNotification } from '../services/admin-notification.service.js'
import { cancelAdminPlacementDrive, closeAdminPlacementDrive, closeAdminPlacementDriveApplications, extendAdminPlacementDriveDeadline, getAdminPublishedDriveMonitoring, postponeAdminPlacementDrive, reopenAdminPlacementDriveApplications } from '../services/placement-drive.service.js'

const titleCase = value => value ? value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase()) : 'Not specified'
const dateLabel = value => value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Not specified'
const list = value => value?.length ? value.join(', ') : 'Not specified'

export function AdminPlacementDriveMonitoringDetailPage() {
  const { id } = useParams()
  const { session } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [windowAction, setWindowAction] = useState('')
  const [deadline, setDeadline] = useState('')
  const [windowBusy, setWindowBusy] = useState(false)
  const [windowMessage, setWindowMessage] = useState('')
  const [phaseFilter, setPhaseFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [branchFilter, setBranchFilter] = useState('all')
  const [lifecycleAction, setLifecycleAction] = useState('')
  const [lifecycleReason, setLifecycleReason] = useState('')
  const [lifecycleBusy, setLifecycleBusy] = useState(false)

  useEffect(() => {
    let active = true
    getAdminPublishedDriveMonitoring(session.accessToken, id).then(({ data }) => { if (active) setData(data) }).catch(error => { if (active) setError(error.message) })
    return () => { active = false }
  }, [id, session.accessToken])

  const back = <Link className="text-sm font-bold text-blue-700" to="/admin/placement-drives/monitoring">← Placement Drive monitoring</Link>
  if (error) return <section className="space-y-6">{back}<ErrorState message={error} /></section>
  if (!data) return <LoadingState message="Loading Placement Drive monitoring…" />
  const drive = data.drive || {}
  const isOperational = drive.lifecycleStatus === 'published'
  const phases = [...(drive.phases || [])].filter(phase => phase.phaseNumber >= 1).sort((a, b) => a.phaseNumber - b.phaseNumber)
  const applicationWindow = drive.applicationWindow
  const branches = [...new Set((data.students || []).map(student => student.branch).filter(Boolean))].sort()
  const visibleStudents = (data.students || []).filter(student => (phaseFilter === 'all' || String(student.currentPhase) === phaseFilter) && (statusFilter === 'all' || student.currentStatus === statusFilter) && (branchFilter === 'all' || student.branch === branchFilter))

  async function manageWindow(event) {
    event.preventDefault()
    if (windowBusy || !windowAction) return
    setWindowBusy(true); setError(''); setWindowMessage('')
    try {
      const request = windowAction === 'extend' ? extendAdminPlacementDriveDeadline(session.accessToken, id, { applicationDeadline: deadline }) : windowAction === 'close' ? closeAdminPlacementDriveApplications(session.accessToken, id) : reopenAdminPlacementDriveApplications(session.accessToken, id, deadline ? { applicationDeadline: deadline } : {})
      const { data: result } = await request
      setData(current => ({ ...current, drive: { ...current.drive, ...result.drive, applicationWindow: result.applicationWindow }, summary: { ...current.summary, applicationDeadline: result.drive.driveDetails?.applicationDeadline } }))
      setWindowMessage(result.alreadyClosed ? 'Applications are already closed.' : result.alreadyOpen ? 'Applications are already open.' : windowAction === 'extend' ? 'Application deadline extended.' : windowAction === 'close' ? 'Applications closed.' : 'Applications reopened.')
      setWindowAction(''); setDeadline('')
    } catch (error) { setError(error.message) } finally { setWindowBusy(false) }
  }

  async function manageLifecycle(event) {
    event.preventDefault()
    if (!lifecycleAction || lifecycleBusy) return
    setLifecycleBusy(true); setError(''); setWindowMessage('')
    try {
      const request = lifecycleAction === 'postpone' ? postponeAdminPlacementDrive(session.accessToken, id, { reason: lifecycleReason }) : lifecycleAction === 'close' ? closeAdminPlacementDrive(session.accessToken, id, { reason: lifecycleReason }) : cancelAdminPlacementDrive(session.accessToken, id, { reason: lifecycleReason })
      const { data: result } = await request
      setData(current => ({ ...current, drive: { ...current.drive, ...result.drive }, summary: { ...current.summary, lifecycleStatus: result.drive.lifecycleStatus } }))
      setWindowMessage(result.alreadyChanged ? `Drive is already ${result.drive.lifecycleStatus}.` : `Drive ${result.drive.lifecycleStatus}. ${result.notificationsCreated} active applicant notification${result.notificationsCreated === 1 ? '' : 's'} sent.`)
      setLifecycleAction(''); setLifecycleReason('')
    } catch (error) { setError(error.message) } finally { setLifecycleBusy(false) }
  }

  return <section className="space-y-6">
    {back}
    <PageHeader eyebrow={drive.company?.companyName || 'Company'} title={drive.role?.title || 'Placement Drive'} description={`${data.applicationCount} applicant${data.applicationCount === 1 ? '' : 's'} · ${drive.role?.domain || 'Category not specified'}`} action={<StatusBadge status={drive.lifecycleStatus}>{titleCase(drive.lifecycleStatus)}</StatusBadge>} />
    <DriveContextHeader drive={drive} summary={data.summary} applicationCount={data.applicationCount} />
    <Funnel funnel={data.funnel} />
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-blue-700">Drive lifecycle</p><h2 className="mt-1 font-bold text-slate-950">{drive.lifecycleStatus === 'completed' ? 'Closed' : titleCase(drive.lifecycleStatus)}</h2><p className="mt-1 text-sm text-slate-600">Closing, postponing, or cancelling freezes recruitment execution without deleting Applications, phase history, resources, or outcomes.</p></div>{drive.lifecycleStatus === 'published' && <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setLifecycleAction('postpone')}>Postpone</Button><Button variant="secondary" onClick={() => setLifecycleAction('close')}>Close Drive</Button><Button variant="danger" onClick={() => setLifecycleAction('cancel')}>Cancel Drive</Button></div>}{drive.lifecycleStatus === 'postponed' && <Button variant="danger" onClick={() => setLifecycleAction('cancel')}>Cancel Drive</Button>}</div>{lifecycleAction && <div className="fixed inset-0 z-50 flex items-end bg-slate-950/40 p-4 sm:items-center sm:justify-center"><form className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onSubmit={manageLifecycle}><h2 className="text-xl font-bold text-slate-950">{lifecycleAction === 'close' ? 'Close this Drive?' : `${titleCase(lifecycleAction)} this Drive?`}</h2><p className="mt-2 text-sm text-slate-600">Applications, candidate phases, resources, and history will be preserved. Recruitment execution will stop.</p><div className="mt-4"><FormField as="textarea" required label={`Reason to ${lifecycleAction} Drive`} value={lifecycleReason} onChange={event => setLifecycleReason(event.target.value)} /></div><div className="mt-5 flex justify-end gap-3"><Button variant="quiet" disabled={lifecycleBusy} onClick={() => { setLifecycleAction(''); setLifecycleReason('') }}>Back</Button><Button variant={lifecycleAction === 'cancel' ? 'danger' : 'secondary'} type="submit" disabled={lifecycleBusy}>{lifecycleBusy ? 'Saving…' : lifecycleAction === 'close' ? 'Confirm Close Drive' : `Confirm ${titleCase(lifecycleAction)}`}</Button></div></form></div>}</section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-blue-700">Application Window</p><h2 className="mt-1 font-bold text-slate-950">{isOperational && applicationWindow?.open ? 'Open' : 'Closed'} · Deadline {dateLabel(drive.driveDetails?.applicationDeadline)}</h2><p className="mt-1 text-sm text-slate-600">{!isOperational ? 'This Drive is closed and read-only. Existing applications and history remain available below.' : applicationWindow?.reason === 'deadline_passed' ? 'The deadline has passed. Reopening requires a new future deadline.' : applicationWindow?.reason === 'manually_closed' ? 'Applications were manually closed. Existing applications are unchanged.' : 'Students can submit new applications while eligibility requirements are met.'}</p></div>{isOperational && <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => { setWindowAction('extend'); setDeadline('') }}>Extend Deadline</Button>{applicationWindow?.open ? <Button variant="danger" onClick={() => { setWindowAction('close'); setDeadline('') }}>Close Applications</Button> : <Button onClick={() => { setWindowAction('reopen'); setDeadline('') }}>Reopen Applications</Button>}</div>}</div>{windowAction && <form className="mt-5 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2" onSubmit={manageWindow}>{windowAction !== 'close' && <FormField required={windowAction === 'extend' || applicationWindow?.reason === 'deadline_passed'} type="datetime-local" label={windowAction === 'extend' ? 'New application deadline' : 'New deadline (required after expiry)'} value={deadline} onChange={event => setDeadline(event.target.value)} />}<div className="flex flex-wrap items-end gap-3"><Button type="submit" disabled={windowBusy}>{windowBusy ? 'Saving…' : windowAction === 'extend' ? 'Extend Deadline' : windowAction === 'close' ? 'Close Applications' : 'Reopen Applications'}</Button><Button variant="quiet" disabled={windowBusy} onClick={() => { setWindowAction(''); setDeadline('') }}>Cancel</Button></div></form>}{windowMessage && <p role="status" className="mt-4 text-sm font-semibold text-emerald-800">{windowMessage}</p>}</section>
    {isOperational && <DriveMessageComposer driveName={`${drive.company?.companyName || 'Company'} · ${drive.role?.title || 'Placement Drive'}`} actions={[{ id: 'eligible', label: 'Notify Eligible Students', description: 'Send to Students who currently meet this published Drive’s eligibility rules.', send: form => sendAdminStudentNotification(session.accessToken, { ...form, audience: 'eligible_drive', placementDriveId: drive._id }), success: result => `Notification sent to ${result.data?.notificationsCreated ?? 0} eligible Student${result.data?.notificationsCreated === 1 ? '' : 's'}.` }, { id: 'applicants', label: 'Notify Applicants', description: 'Send to active applicants of this Drive. Withdrawn applications are excluded.', send: form => sendAdminStudentNotification(session.accessToken, { ...form, audience: 'drive_applicants', placementDriveId: drive._id }), success: result => `Notification sent to ${result.data?.notificationsCreated ?? 0} applicant${result.data?.notificationsCreated === 1 ? '' : 's'}.` }, ...(drive.company?.userId ? [{ id: 'company', label: 'Message Company', description: 'Send a direct placement-related message to this Drive’s approved Company.', send: form => sendAdminCompanyNotification(session.accessToken, drive.company.userId, { ...form, placementDriveId: drive._id }), success: () => 'Message sent to Company.' }] : [])]} />}
    <Record title="Company" items={[["Company name", drive.company?.companyName], ["Industry", drive.company?.industry], ["Official contact", drive.company?.officialEmail], ["Location", drive.company?.location]]} />
    <Record title="Eligibility summary" items={[["Eligible branches", list(drive.eligibility?.allowedBranches)], ["Minimum CGPA / CPI", drive.eligibility?.minimumCgpa], ["Maximum active backlogs", drive.eligibility?.maximumActiveBacklogs], ["Graduation years", list(drive.eligibility?.graduationYears)], ["Application deadline", dateLabel(drive.driveDetails?.applicationDeadline)]]} />
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-950">Recruitment phase blueprint</h2><p className="mt-1 text-sm text-slate-600">Phase 0 is the current application and screening pool. Company-defined phases begin at Phase 1.</p><div className="mt-4 grid gap-3">{phases.map(phase => <article key={phase.phaseNumber} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Phase {phase.phaseNumber}: {phase.title}</h3><StatusBadge status="neutral">{titleCase(phase.type)}</StatusBadge></div>{phase.description && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{phase.description}</p>}</article>)}</div></section>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4"><div><h2 className="font-bold text-slate-950">Applications</h2><p className="mt-1 text-sm text-slate-600">Lightweight monitoring across the shared Application records.</p></div><StatusBadge status="neutral">{visibleStudents.length} shown</StatusBadge></div>{data.students?.length ? <><div className="grid gap-3 border-b border-slate-100 bg-slate-50 px-5 py-4 sm:grid-cols-3"><label className="text-sm font-semibold">Phase<select className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2" value={phaseFilter} onChange={event => setPhaseFilter(event.target.value)}><option value="all">All phases</option>{(data.funnel?.phases || []).map(item => <option key={item.phaseNumber} value={item.phaseNumber}>Phase {item.phaseNumber}</option>)}</select></label><label className="text-sm font-semibold">Status<select className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{[...new Set(data.students.map(student => student.currentStatus))].sort().map(status => <option key={status} value={status}>{titleCase(status)}</option>)}</select></label><label className="text-sm font-semibold">Branch<select className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2" value={branchFilter} onChange={event => setBranchFilter(event.target.value)}><option value="all">All branches</option>{branches.map(branch => <option key={branch} value={branch}>{branch}</option>)}</select></label></div><div className="hidden grid-cols-[minmax(10rem,1.3fr)_minmax(7rem,.8fr)_6rem_5rem_minmax(7rem,.8fr)_minmax(9rem,1fr)] gap-4 border-b border-slate-100 bg-slate-50 px-5 py-3 text-xs font-bold uppercase tracking-[0.08em] text-slate-500 xl:grid"><span>Student</span><span>Branch</span><span>Applied</span><span>Phase</span><span>Status</span><span>Placement</span></div><div className="divide-y divide-slate-100">{visibleStudents.map(student => <article key={student.applicationId} className="grid gap-4 px-5 py-5 xl:grid-cols-[minmax(10rem,1.3fr)_minmax(7rem,.8fr)_6rem_5rem_minmax(7rem,.8fr)_minmax(9rem,1fr)] xl:items-center"><div><h3 className="font-semibold text-slate-950">{student.name || 'Student'}</h3><p className="mt-1 text-sm text-slate-600">{student.rollNumber || 'Enrollment number not available'}</p></div><Value label="Branch" value={student.branch} /><Value label="Applied" value={dateLabel(student.appliedAt)} /><Value label="Current phase" value={`Phase ${student.currentPhase}`} /><div><p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500 xl:hidden">Current status</p><StatusBadge status="neutral">{titleCase(student.currentStatus)}</StatusBadge></div><div><p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500 xl:hidden">Placement</p><StatusBadge status="neutral">{student.confirmationState ? titleCase(student.confirmationState) : 'Not reported'}</StatusBadge></div></article>)}{!visibleStudents.length && <div className="p-5"><EmptyState title="No matching candidates" description="Try clearing a filter to see other applicants." /></div>}</div></> : <div className="p-5"><EmptyState title="No applications yet" description="Students who apply to this open drive will appear here in Phase 0." /></div>}</section>
  </section>
}

function Funnel({ funnel = {} }) { const statuses = [['Provisional selected', funnel.statuses?.selected_pending_confirmation], ['Pending confirmation', funnel.confirmationPending], ['Confirmed placements', funnel.confirmedPlacements], ['Rejected', funnel.statuses?.rejected], ['Absent', funnel.statuses?.absent], ['Withdrawn', funnel.statuses?.withdrawn], ['Closed elsewhere', funnel.statuses?.closed_placed_elsewhere]]; const active = (funnel.phases || []).reduce((total, item) => total + (item.count || 0), 0); const exited = ['rejected', 'absent', 'withdrawn', 'closed_placed_elsewhere'].reduce((total, status) => total + (funnel.statuses?.[status] || 0), 0); return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-950">Recruitment funnel</h2><div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5"><Metric label="Applicants" value={funnel.total} /><Metric label="Active candidates" value={active} /><Metric label="Exited" value={exited} />{(funnel.phases || []).map(item => <Metric key={item.phaseNumber} label={`Phase ${item.phaseNumber}`} value={item.count} />)}</div><div className="mt-4 flex flex-wrap gap-2">{statuses.map(([label, value]) => <span key={label} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{label}: {value ?? 0}</span>)}</div></section> }
function Metric({ label, value }) { return <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-950">{value ?? 0}</p></div> }

function Record({ title, items }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-950">{title}</h2><dl className="mt-3 grid gap-3 sm:grid-cols-2">{items.map(([label, value]) => <Value key={label} label={label} value={value} />)}</dl></section>
}

function Value({ label, value }) {
  return <div><dt className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">{label}</dt><dd className="mt-1 text-sm text-slate-800">{value === '' || value == null ? 'Not specified' : value}</dd></div>
}
