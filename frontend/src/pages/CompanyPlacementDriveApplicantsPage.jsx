import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EmptyState } from '../components/feedback/EmptyState.jsx'
import { ErrorState } from '../components/feedback/ErrorState.jsx'
import { LoadingState } from '../components/feedback/LoadingState.jsx'
import { DriveContextHeader } from '../components/placement-drives/DriveContextHeader.jsx'
import { DriveMessageComposer } from '../components/notifications/DriveMessageComposer.jsx'
import { PageHeader } from '../components/ui/PageHeader.jsx'
import { StatusBadge } from '../components/ui/StatusBadge.jsx'
import { useAuth } from '../features/auth/useAuth.js'
import { listCompanyDriveApplicants } from '../services/company-drive-applicant.service.js'
import { sendCompanyAdminNotification, sendCompanyDriveApplicantsNotification } from '../services/company-notification.service.js'

const dateLabel = value => value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Not specified'
const titleCase = value => value ? value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase()) : 'Not specified'

export function CompanyPlacementDriveApplicantsPage() {
  const { id } = useParams()
  const { session } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    listCompanyDriveApplicants(session.accessToken, id).then(({ data }) => { if (active) setData(data) }).catch(error => { if (active) setError(error.message) })
    return () => { active = false }
  }, [id, session.accessToken])

  const back = <Link className="text-sm font-bold text-violet-700" to={`/company/placement-drives/${id}`}>← Placement Drive</Link>
  if (error) return <section className="space-y-6">{back}<ErrorState message={error} /></section>
  if (!data) return <LoadingState message="Loading Phase 0 applicants…" />
  const role = data.drive?.role?.title || 'Placement Drive'
  const applicants = data.applicants || []
  const exited = data.exited || []

  return <section className="space-y-6">
    {back}
    <PageHeader eyebrow="Campus Recruitment Portal" title={`Phase 0 applicants · ${role}`} description="Applicants are in the application and screening pool. Candidate movement is managed in a later recruitment phase." action={<StatusBadge status="neutral">{applicants.length} applicant{applicants.length === 1 ? '' : 's'}</StatusBadge>} />
    <DriveContextHeader drive={data.drive} summary={data.summary} />
    <DriveMessageComposer driveName={role} actions={[{ id: 'applicants', label: 'Notify Applicants', description: 'Send this message to active Phase 0 applicants of this Drive. Withdrawn candidates are excluded.', send: form => sendCompanyDriveApplicantsNotification(session.accessToken, { ...form, placementDriveId: id }), success: result => `Notification sent to ${result.data?.notificationsCreated ?? 0} active applicant${result.data?.notificationsCreated === 1 ? '' : 's'}.` }, { id: 'admin', label: 'Message Placement Admin', description: 'Send a placement-related message with this Drive already attached.', send: form => sendCompanyAdminNotification(session.accessToken, { ...form, placementDriveId: id }), success: () => 'Message sent to Placement Admin.' }]} />
    {!applicants.length ? <EmptyState title="No Phase 0 applicants yet" description="Eligible Students who apply to this published Placement Drive will appear here." /> : <ApplicantTable applicants={applicants} id={id} />}
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 px-5 py-4"><h2 className="font-bold text-slate-950">Withdrawn / exited</h2><p className="mt-1 text-sm text-slate-600">Retained for recruitment history and incident reporting. These candidates are not in the active Phase 0 pool.</p></div>{exited.length ? <ApplicantTable applicants={exited} id={id} /> : <p className="px-5 py-6 text-sm text-slate-600">No withdrawn or exited candidates.</p>}</section>
  </section>
}

function ApplicantTable({ applicants, id }) { return <div className="overflow-hidden"><div className="hidden grid-cols-[minmax(11rem,1.5fr)_minmax(7rem,1fr)_5rem_6.5rem_6rem_7rem_minmax(8rem,.8fr)] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-bold uppercase tracking-[0.08em] text-slate-500 xl:grid"><span>Student</span><span>Branch</span><span>CGPA</span><span>Backlogs</span><span>Phase</span><span>Applied</span><span /></div><div className="divide-y divide-slate-100">{applicants.map(applicant => <article key={applicant.applicationId} className="grid gap-4 px-5 py-5 xl:grid-cols-[minmax(11rem,1.5fr)_minmax(7rem,1fr)_5rem_6.5rem_6rem_7rem_minmax(8rem,.8fr)] xl:items-center"><div><h2 className="font-bold text-slate-950">{applicant.student?.name || 'Student'}</h2><p className="mt-1 text-sm text-slate-600">{applicant.student?.rollNumber || 'Enrollment number not available'}</p></div><Value label="Branch" value={applicant.student?.branch} /><Value label="CGPA / CPI" value={applicant.student?.cgpa} /><Value label="Active backlogs" value={applicant.student?.activeBacklogs} /><div><p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500 xl:hidden">Current stage</p><StatusBadge status="neutral">Phase {applicant.currentPhase} · {titleCase(applicant.currentStatus)}</StatusBadge></div><Value label="Applied" value={dateLabel(applicant.appliedAt)} /><Link className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50" to={`/company/placement-drives/${id}/applicants/${applicant.student?.studentId}`}>View profile</Link></article>)}</div></div> }

function Value({ label, value }) {
  return <div><p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500 xl:hidden">{label}</p><p className="mt-1 text-sm text-slate-800 xl:mt-0">{value === '' || value == null ? 'Not specified' : value}</p></div>
}
