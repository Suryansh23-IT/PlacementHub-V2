import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { EmptyState } from '../components/feedback/EmptyState.jsx'
import { ErrorState } from '../components/feedback/ErrorState.jsx'
import { LoadingState } from '../components/feedback/LoadingState.jsx'
import { PageHeader } from '../components/ui/PageHeader.jsx'
import { StatusBadge } from '../components/ui/StatusBadge.jsx'
import { useAuth } from '../features/auth/useAuth.js'
import { getCompanies } from '../services/company.service.js'

const filters = ['pending', 'approved', 'rejected', 'all']
export function AdminCompaniesPage() {
  const { session } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useSearchParams()
  const filter = filters.includes(search.get('status')) ? search.get('status') : 'pending'
  useEffect(() => {
    let active = true
    getCompanies(session.accessToken).then(({ data }) => { if (active) setItems(data) })
      .catch(error => { if (active) setError(error.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [session.accessToken])
  if (loading) return <LoadingState message="Loading companies for review…" />
  const counts = items.reduce((counts, item) => {
    const status = item.company?.approvalStatus || 'pending'
    counts[status] = (counts[status] || 0) + 1
    return counts
  }, { all: items.length, pending: 0, approved: 0, rejected: 0 })
  const visible = filter === 'all' ? items : items.filter(item => (item.company?.approvalStatus || 'pending') === filter)
  return <section className="space-y-8">
    <PageHeader eyebrow="Placement Admin" title="Company approvals" description="Review the company profile before it can participate in campus hiring." />
    <div className="flex flex-wrap gap-2">{filters.map(status => <button key={status} aria-pressed={filter === status} onClick={() => setSearch({ status })} className={`rounded-xl px-3 py-2 text-sm font-semibold ${filter === status ? 'bg-violet-700 text-white' : 'border bg-white'}`}>{status[0].toUpperCase() + status.slice(1)} ({counts[status]})</button>)}</div>
    {error ? <ErrorState message={error} /> : visible.length === 0 ? <EmptyState title={`No ${filter} companies`} description="Choose another status to review other records." /> : <div className="grid gap-5 xl:grid-cols-2">{visible.map(item => {
      const profile = item.company || {}
      return <article key={item._id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex justify-between gap-3"><div><h2 className="text-lg font-bold">{profile.companyName || item.name}</h2><p className="mt-1 text-sm text-slate-600">{profile.industry || 'Industry not provided'} · {profile.recruitmentTimeline || 'Timeline not provided'}</p><p className="mt-2 text-sm">Recruiter: {profile.recruiterName || 'Not provided'}</p></div><StatusBadge status={profile.approvalStatus || 'pending'} /></div>
        {profile.approvalStatus === 'pending' && !item.isProfileComplete && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Incomplete profile or Participation Letter.</p>}
        {profile.rejectionReason && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{profile.rejectionReason}</p>}
        <Link className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500" to={`/admin/companies/${item._id}?status=${filter}`}>Review company</Link>
      </article>
    })}</div>}
  </section>
}
