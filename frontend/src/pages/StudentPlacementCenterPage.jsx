import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { EmptyState } from '../components/feedback/EmptyState.jsx'
import { ErrorState } from '../components/feedback/ErrorState.jsx'
import { LoadingState } from '../components/feedback/LoadingState.jsx'
import { PageHeader } from '../components/ui/PageHeader.jsx'
import { StatusBadge } from '../components/ui/StatusBadge.jsx'
import { useAuth } from '../features/auth/useAuth.js'
import { listMyPlacementApplications, listStudentPlacementDrives, withdrawStudentPlacementApplication } from '../services/student-placement-drive.service.js'
import { Button } from '../components/ui/Button.jsx'

const titleCase = value => value ? value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase()) : 'Not specified'
const dateLabel = value => value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Not specified'

function compensationLabel(drive) {
  const compensation = drive.driveDetails?.compensation
  if (!compensation || compensation.period === 'not_disclosed' || compensation.amount == null) return 'Not disclosed'
  const period = { per_annum: 'per annum', per_month: 'per month', stipend: 'stipend' }[compensation.period] || compensation.period
  return `${compensation.currency || 'INR'} ${Number(compensation.amount).toLocaleString()} ${period}`
}

export function StudentPlacementCenterPage() {
  const { session } = useAuth()
  const [search, setSearch] = useSearchParams()
  const [drives, setDrives] = useState(null)
  const [applications, setApplications] = useState(null)
  const [error, setError] = useState('')
  const [withdrawingId, setWithdrawingId] = useState('')
  const tab = search.get('tab') === 'applications' ? 'applications' : 'open'

  useEffect(() => {
    let active = true
    Promise.all([listStudentPlacementDrives(session.accessToken), listMyPlacementApplications(session.accessToken)])
      .then(([driveResponse, applicationResponse]) => {
        if (!active) return
        setDrives(driveResponse.data)
        setApplications(applicationResponse.data)
      })
      .catch(error => { if (active) setError(error.message) })
    return () => { active = false }
  }, [session.accessToken])

  if (error && (!drives || !applications)) return <ErrorState message={error} />
  if (!drives || !applications) return <LoadingState message="Loading your Placement Center…" />

  async function withdraw(application) {
    if (!['applied', 'screening', 'pending', 'result_pending', 'qualified', 'active'].includes(application.currentStatus) || withdrawingId) return
    setWithdrawingId(application._id)
    setError('')
    try {
      const { data } = await withdrawStudentPlacementApplication(session.accessToken, application._id)
      setApplications(current => current.map(item => item._id === application._id ? { ...item, ...data } : item))
    } catch (error) { setError(error.message) } finally { setWithdrawingId('') }
  }

  return <section className="space-y-7">
    <PageHeader eyebrow="Student Placement Portal" title="Placement Center" description="Browse open opportunities, check drive-specific eligibility, and follow your applications." />
    <div className="flex w-fit rounded-xl border border-slate-200 bg-slate-50 p-1" role="tablist" aria-label="Placement Center sections">
      <Tab active={tab === 'open'} onClick={() => setSearch({ tab: 'open' })}>Placement Drives <span className="ml-1 text-xs">{drives.length}</span></Tab>
      <Tab active={tab === 'applications'} onClick={() => setSearch({ tab: 'applications' })}>My Applications <span className="ml-1 text-xs">{applications.length}</span></Tab>
    </div>
    {error && <ErrorState message={error} />}
    {tab === 'open' ? <OpenDrives drives={drives} /> : <Applications applications={applications} withdrawingId={withdrawingId} onWithdraw={withdraw} />}
  </section>
}

function Tab({ active, onClick, children }) {
  return <button type="button" role="tab" aria-selected={active} className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${active ? 'bg-white text-violet-800 shadow-sm' : 'text-slate-600 hover:text-slate-950'}`} onClick={onClick}>{children}</button>
}

function OpenDrives({ drives }) {
  if (!drives.length) return <EmptyState title="No published Placement Drives" description="New opportunities will appear here when the Placement Cell publishes them." />
  return <div className="grid gap-4 lg:grid-cols-2">{drives.map(drive => {
    const eligible = drive.eligibilityResult?.eligible
    const reasons = drive.eligibilityResult?.reasons || []
    const application = drive.hasApplied ? drive.application : null
    const existingApplication = Boolean(application)
    const applicationLabel = application?.currentStatus === 'withdrawn' ? 'Application withdrawn' : `Applied · Phase ${application?.currentPhase ?? 0}`
    return <article key={drive._id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-violet-200 hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-700">{drive.company?.companyName || 'Company'}</p><h2 className="mt-2 text-lg font-bold text-slate-950">{drive.role?.title || 'Placement Drive'}</h2><p className="mt-1 text-sm text-slate-600">{drive.role?.domain || 'Role details'}{drive.driveDetails?.workLocation ? ` · ${drive.driveDetails.workLocation}` : ''}</p></div><StatusBadge status={existingApplication ? 'neutral' : eligible ? 'approved' : 'rejected'}>{existingApplication ? applicationLabel : eligible ? 'Eligible' : 'Not eligible'}</StatusBadge></div>
      <dl className="mt-5 grid gap-3 border-y border-slate-100 py-4 text-sm sm:grid-cols-2"><Info label="Compensation" value={compensationLabel(drive)} /><Info label="Application window" value={drive.applicationWindow?.open ? `Open until ${dateLabel(drive.applicationDeadline || drive.driveDetails?.applicationDeadline)}` : drive.applicationWindow?.reason === 'deadline_passed' ? 'Deadline passed' : 'Applications closed'} /></dl>
      {!existingApplication && !eligible && reasons.length > 0 && <p className="mt-4 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">{reasons[0].message}{reasons.length > 1 ? ` + ${reasons.length - 1} other requirement${reasons.length === 2 ? '' : 's'}` : ''}</p>}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><span className="text-sm font-medium text-slate-500">{existingApplication ? application?.currentStatus === 'withdrawn' ? 'Application withdrawn' : `Application submitted${drive.applicationWindow?.open ? '' : ' · New applications are closed'}` : 'Review details before applying'}</span><Link className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50" to={`/student/placement/${drive._id}`}>View Drive</Link></div>
    </article>
  })}</div>
}

function Applications({ applications, withdrawingId, onWithdraw }) {
  if (!applications.length) return <EmptyState title="No applications yet" description="When you apply to an eligible open drive, it will appear here in Phase 0." />
  return <div className="grid gap-4 lg:grid-cols-2">{applications.map(application => {
    const drive = application.drive || {}; const withdrawn = application.currentStatus === 'withdrawn'; const withdrawable = ['applied', 'screening', 'pending', 'result_pending', 'qualified', 'active'].includes(application.currentStatus)
    return <article key={application._id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-700">{drive.company?.companyName || 'Company'}</p><h2 className="mt-2 text-lg font-bold text-slate-950">{drive.role?.title || 'Placement Drive'}</h2><p className="mt-1 text-sm text-slate-600">Applied {dateLabel(application.appliedAt)}</p></div><StatusBadge status="neutral">Phase {application.currentPhase} · {titleCase(application.currentStatus)}</StatusBadge></div><div className="mt-5 border-t border-slate-100 pt-4 text-sm text-slate-600"><p><strong className="font-semibold text-slate-800">Current stage:</strong> {withdrawn ? 'Withdrawn — no longer active' : application.currentPhase === 0 ? 'Phase 0 — Applicant / screening pool' : `Phase ${application.currentPhase}`}</p><p className="mt-1">{withdrawn ? 'Withdrawal history is retained for your placement record.' : 'Open your recruitment journey for the current action, timeline, and phase resources.'}</p></div><div className="mt-5 flex flex-wrap gap-3"><Link className="inline-flex min-h-10 items-center text-sm font-bold text-violet-700 hover:underline" to={`/student/applications/${application._id}/journey`}>View journey</Link>{application.placementDriveId && <Link className="inline-flex min-h-10 items-center text-sm font-bold text-slate-600 hover:underline" to={`/student/placement/${application.placementDriveId}`}>View Drive</Link>}{withdrawable && <Button variant="danger" disabled={Boolean(withdrawingId)} onClick={() => onWithdraw(application)}>{withdrawingId === application._id ? 'Withdrawing…' : 'Withdraw application'}</Button>}</div></article>
  })}</div>
}

function Info({ label, value }) {
  return <div><dt className="text-xs font-bold text-slate-500">{label}</dt><dd className="mt-1 font-medium text-slate-800">{value}</dd></div>
}
