import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../components/feedback/EmptyState.jsx'
import { ErrorState } from '../components/feedback/ErrorState.jsx'
import { LoadingState } from '../components/feedback/LoadingState.jsx'
import { PageHeader } from '../components/ui/PageHeader.jsx'
import { StatusBadge } from '../components/ui/StatusBadge.jsx'
import { useAuth } from '../features/auth/useAuth.js'
import { getStudentsForReview } from '../services/student.service.js'

export function AdminStudentsPage() {
  const { session } = useAuth()
  const [students, setStudents] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('pending')

  useEffect(() => {
    let active = true
    getStudentsForReview(session.accessToken).then(({ data }) => active && setStudents(data)).catch((requestError) => active && setError(requestError.message)).finally(() => active && setIsLoading(false))
    return () => { active = false }
  }, [session.accessToken])


  if (isLoading) return <LoadingState message="Loading student profiles for review…" />
  const counts = students.reduce((result, student) => ({ ...result, [student.profile?.verificationStatus ?? 'pending']: (result[student.profile?.verificationStatus ?? 'pending'] ?? 0) + 1 }), { all: students.length, pending: 0, verified: 0, rejected: 0 })
  const visibleStudents = status === 'all' ? students : students.filter((student) => (student.profile?.verificationStatus ?? 'pending') === status)
  return <section className="space-y-8"><PageHeader eyebrow="Placement Admin" title="Student management" description="Open a candidate record to inspect details and make a verification decision." />{error && <ErrorState message={error} />}{students.length === 0 ? <EmptyState title="No student accounts yet" description="Student accounts will appear here once they register." /> : <><div className="flex flex-wrap gap-2" aria-label="Student status filters">{['all', 'pending', 'verified', 'rejected'].map((item) => <button type="button" key={item} onClick={() => setStatus(item)} className={`rounded-xl px-3 py-2 text-sm font-semibold ${status === item ? 'bg-violet-700 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>{item[0].toUpperCase() + item.slice(1)} ({counts[item]})</button>)}</div>{visibleStudents.length ? <div className="grid gap-5 xl:grid-cols-2">{visibleStudents.map((student) => <StudentReviewCard key={student._id} student={student} />)}</div> : <EmptyState title={`No ${status} students`} description="Choose another status to review other student records." />}</>}</section>
}

function StudentReviewCard({ student }) {
  const profile = student.profile ?? {}
  return <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-950">{student.name}</h2><p className="mt-1 text-sm text-slate-600">{profile.rollNumber ?? 'Roll number not provided'}</p></div><StatusBadge status={profile.verificationStatus ?? 'pending'} /></div><dl className="mt-5 grid grid-cols-3 gap-4 border-t border-slate-100 pt-5 text-sm"><Detail label="Branch" value={profile.branch ?? 'Not provided'} /><Detail label="CPI" value={profile.cgpa ?? 'Not provided'} /><Detail label="Status" value={profile.verificationStatus ?? 'pending'} /></dl><Link className="mt-5 inline-flex rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white" to={`/admin/students/${student._id}`}>Open candidate review</Link></article>
}

function Detail({ label, value }) { return <div><dt className="font-medium text-slate-500">{label}</dt><dd className="mt-1 font-semibold text-slate-800">{value}</dd></div> }
