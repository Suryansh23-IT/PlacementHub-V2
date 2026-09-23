import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { EmptyState } from '../components/feedback/EmptyState.jsx'
import { ErrorState } from '../components/feedback/ErrorState.jsx'
import { LoadingState } from '../components/feedback/LoadingState.jsx'
import { PageHeader } from '../components/ui/PageHeader.jsx'
import { StatusBadge } from '../components/ui/StatusBadge.jsx'
import { useAuth } from '../features/auth/useAuth.js'
import { getCompanies } from '../services/company.service.js'
import { listAdminPlacementDrives } from '../services/placement-drive.service.js'

const FILTERS = [
  ['submitted', 'Pending Review'],
  ['changes_requested', 'Changes Requested'],
  ['approved', 'Approved'],
  ['rejected', 'Rejected'],
  ['all', 'All'],
]

const titleCase = value => value ? value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase()) : 'Not specified'
const dateLabel = value => value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Not specified'

function compensationLabel(drive) {
  const compensation = drive.driveDetails?.compensation
  if (!compensation || compensation.period === 'not_disclosed' || compensation.amount == null) return 'Not disclosed'
  const period = { per_annum: 'per annum', per_month: 'per month', stipend: 'stipend' }[compensation.period] || compensation.period
  return `${compensation.currency || 'INR'} ${Number(compensation.amount).toLocaleString()} ${period}`
}

export function AdminPlacementDrivesPage() {
  const { session } = useAuth()
  const [drives, setDrives] = useState([])
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useSearchParams()
  const filter = FILTERS.some(([value]) => value === search.get('status')) ? search.get('status') : 'submitted'

  useEffect(() => {
    let active = true
    Promise.all([listAdminPlacementDrives(session.accessToken), getCompanies(session.accessToken)])
      .then(([driveResponse, companyResponse]) => {
        if (!active) return
        setDrives(driveResponse.data)
        setCompanies(companyResponse.data)
      })
      .catch(error => { if (active) setError(error.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [session.accessToken])

  const companyById = useMemo(() => new Map(companies.map(company => [String(company.company?._id), company])), [companies])
  if (loading) return <LoadingState message="Loading Placement Drive proposals…" />
  const counts = drives.reduce((result, drive) => ({ ...result, [drive.proposalStatus]: (result[drive.proposalStatus] || 0) + 1 }), { all: drives.length, submitted: 0, changes_requested: 0, approved: 0, rejected: 0 })
  const visible = filter === 'all' ? drives : drives.filter(drive => drive.proposalStatus === filter)

  return <section className="space-y-8">
    <PageHeader eyebrow="Placement Admin" title="Placement proposals" description="Review Company Placement Drive proposals before they can move to the next placement stage." />
    <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">{FILTERS.map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => setSearch({ status: value })} className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${filter === value ? 'bg-violet-700 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'}`}>{label} <span className="ml-1 opacity-80">{counts[value] || 0}</span></button>)}</div>
    {error ? <ErrorState message={error} /> : visible.length === 0 ? <EmptyState title={`No ${FILTERS.find(([value]) => value === filter)?.[1].toLowerCase() || ''} proposals`} description="Choose another status to review other proposals." /> : <div className="grid gap-4 xl:grid-cols-2">{visible.map(drive => {
      const company = companyById.get(String(drive.companyId))
      const profile = company?.company || {}
      return <article key={drive._id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-violet-200 hover:shadow-md">
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-700">{profile.companyName || company?.name || 'Company unavailable'}</p><h2 className="mt-2 text-lg font-bold">{drive.role?.title || 'Role not specified'}</h2><p className="mt-1 text-sm text-slate-600">{drive.role?.domain || 'Category not specified'}</p></div><StatusBadge status={drive.proposalStatus} /></div>
        <dl className="mt-5 grid gap-3 border-y border-slate-100 py-4 text-sm sm:grid-cols-2"><Detail label="Package / CTC" value={compensationLabel(drive)} /><Detail label="Application deadline" value={dateLabel(drive.driveDetails?.applicationDeadline)} /><Detail label="Recruitment phases" value={`${drive.phases?.length || 0} configured`} /><Detail label="Work mode" value={titleCase(drive.driveDetails?.workMode)} /></dl>
        <Link className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500" to={`/admin/placement-drives/${drive._id}?status=${filter}`}>Review proposal</Link>
      </article>
    })}</div>}
  </section>
}

function Detail({ label, value }) {
  return <div><dt className="text-xs font-bold text-slate-500">{label}</dt><dd className="mt-1 font-medium text-slate-800">{value}</dd></div>
}
