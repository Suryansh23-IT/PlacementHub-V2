import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../components/feedback/EmptyState.jsx'
import { ErrorState } from '../components/feedback/ErrorState.jsx'
import { LoadingState } from '../components/feedback/LoadingState.jsx'
import { PageHeader } from '../components/ui/PageHeader.jsx'
import { StatusBadge } from '../components/ui/StatusBadge.jsx'
import { useAuth } from '../features/auth/useAuth.js'
import { listAdminPublishedDriveMonitoring } from '../services/placement-drive.service.js'
import { stableDriveCode } from '../utils/drive-display.js'

const dateLabel = value => value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Not specified'

export function AdminPlacementDriveMonitoringPage() {
  const { session } = useAuth()
  const [drives, setDrives] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    listAdminPublishedDriveMonitoring(session.accessToken).then(({ data }) => { if (active) setDrives(data) }).catch(error => { if (active) setError(error.message) })
    return () => { active = false }
  }, [session.accessToken])

  if (error) return <ErrorState message={error} />
  if (!drives) return <LoadingState message="Loading published Placement Drives…" />
  return <section className="space-y-7">
    <PageHeader eyebrow="Career Development Centre" title="Active Placement Drives" description="Published operational Drives and their current applicant pools. Candidate movement remains available from each Drive workspace." action={<Link className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50" to="/admin/placement-drives">Drive proposals</Link>} />
    {!drives.length ? <EmptyState title="No active Placement Drives" description="Approved Company proposals will appear here after they are published." /> : <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="hidden grid-cols-[minmax(10rem,1.15fr)_minmax(11rem,1.2fr)_8rem_8rem_8rem_8rem_8rem_7rem] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-bold uppercase tracking-[0.08em] text-slate-500 xl:grid"><span>Company</span><span>Role</span><span>Drive code</span><span>Status</span><span>Application window</span><span>Deadline</span><span>Applicants</span><span>Action</span></div><div className="divide-y divide-slate-100">{drives.map(drive => <article key={drive._id} className="grid gap-4 px-5 py-5 xl:grid-cols-[minmax(10rem,1.15fr)_minmax(11rem,1.2fr)_8rem_8rem_8rem_8rem_8rem_7rem] xl:items-center"><Value label="Company" value={drive.company?.companyName || 'Company'} /><Value label="Role" value={drive.role?.title || 'Placement Drive'} /><Value label="Drive code" value={stableDriveCode(drive._id)} /><div><p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500 xl:hidden">Status</p><StatusBadge status="published">Live to Students</StatusBadge></div><WindowState drive={drive} /><Value label="Deadline" value={dateLabel(drive.driveDetails?.applicationDeadline)} /><ApplicantCount active={drive.activeApplicantCount} exited={drive.exitedApplicantCount} /><Link className="inline-flex min-h-10 items-center justify-center rounded-lg bg-violet-700 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-800" to={`/admin/placement-drives/${drive._id}/monitoring`}>Monitor</Link></article>)}</div></section>}
  </section>
}

function windowLabel(drive) { if (drive.applicationWindow?.reason === 'deadline_passed') return 'Expired'; if (!drive.applicationWindow?.open) return 'Closed'; return drive.applicationDeadlineExtendedAt ? 'Open · Extended' : 'Open' }
function WindowState({ drive }) { const label = windowLabel(drive); return <div><p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500 xl:hidden">Application window</p><StatusBadge status={label === 'Expired' ? 'warning' : label === 'Closed' ? 'neutral' : 'approved'}>{label}</StatusBadge></div> }
function ApplicantCount({ active, exited }) { return <div><p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500 xl:hidden">Applicants</p><p className="mt-1 text-sm font-semibold text-slate-800 xl:mt-0">{active ?? 0} active</p>{exited > 0 && <p className="mt-1 text-xs text-slate-500">{exited} exited</p>}</div> }
function Value({ label, value }) { return <div><p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500 xl:hidden">{label}</p><p className="mt-1 text-sm font-semibold text-slate-800 xl:mt-0">{value === '' || value == null ? 'Not specified' : value}</p></div> }
