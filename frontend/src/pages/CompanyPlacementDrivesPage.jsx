import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../components/feedback/EmptyState.jsx'
import { ErrorState } from '../components/feedback/ErrorState.jsx'
import { LoadingState } from '../components/feedback/LoadingState.jsx'
import { PageHeader } from '../components/ui/PageHeader.jsx'
import { StatusBadge } from '../components/ui/StatusBadge.jsx'
import { useAuth } from '../features/auth/useAuth.js'
import { listMyPlacementDrives } from '../services/placement-drive.service.js'

const feedback = drive => drive.review?.requestedChanges || drive.review?.rejectionReason

export function CompanyPlacementDrivesPage() {
  const { session } = useAuth()
  const [drives, setDrives] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    listMyPlacementDrives(session.accessToken).then(({ data }) => { if (active) setDrives(data) }).catch(error => { if (active) setError(error.message) })
    return () => { active = false }
  }, [session.accessToken])

  if (error) return <ErrorState message={error} />
  if (!drives) return <LoadingState message="Loading your Placement Drive proposals…" />
  return <section className="space-y-8">
    <PageHeader eyebrow="Company" title="Placement Drive proposals" description="Create one proposal for each role you want to recruit for. Drafts can be saved before policy acceptance." action={<Link className="inline-flex min-h-11 items-center justify-center rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-800" to="/company/placement-drives/new">Create proposal</Link>} />
    {!drives.length ? <EmptyState title="No Placement Drive proposals" description="Create a proposal when you are ready to describe a role, eligibility rules, PDFs, and recruitment phases." action={<Link className="font-bold text-violet-700 hover:underline" to="/company/placement-drives/new">Create your first proposal</Link>} /> : <div className="grid gap-4 lg:grid-cols-2">{drives.map(drive => <article key={drive._id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-violet-200 hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-700">Placement proposal</p><h2 className="mt-2 text-lg font-bold text-slate-950">{drive.role?.title}</h2><p className="mt-1 text-sm text-slate-600">{drive.role?.employmentType?.replaceAll('_', ' ')} · {drive.driveDetails?.workLocation}</p></div><div className="flex flex-wrap justify-end gap-2"><StatusBadge status={drive.proposalStatus} /><StatusBadge status={drive.lifecycleStatus} /></div></div>
      <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-y border-slate-100 py-3 text-sm text-slate-600"><span><strong className="font-semibold text-slate-800">{drive.phases?.length || 0}</strong> phase{drive.phases?.length === 1 ? '' : 's'}</span><span>Deadline {drive.driveDetails?.applicationDeadline ? new Date(drive.driveDetails.applicationDeadline).toLocaleDateString() : 'not set'}</span></div>
      {feedback(drive) && <p className="mt-4 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2.5 text-sm text-amber-900"><strong>Admin feedback:</strong> {feedback(drive)}</p>}
      <Link className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50" to={`/company/placement-drives/${drive._id}`}>{['draft', 'changes_requested'].includes(drive.proposalStatus) ? 'Edit proposal' : 'View proposal'}</Link>
    </article>)}</div>}
  </section>
}
