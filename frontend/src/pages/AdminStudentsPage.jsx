import { useEffect, useState } from 'react'
import { EmptyState } from '../components/feedback/EmptyState.jsx'
import { ErrorState } from '../components/feedback/ErrorState.jsx'
import { LoadingState } from '../components/feedback/LoadingState.jsx'
import { Button } from '../components/ui/Button.jsx'
import { FormField } from '../components/ui/FormField.jsx'
import { PageHeader } from '../components/ui/PageHeader.jsx'
import { StatusBadge } from '../components/ui/StatusBadge.jsx'
import { useAuth } from '../features/auth/useAuth.js'
import { getStudentsForReview, reviewStudent } from '../services/student.service.js'

export function AdminStudentsPage() {
  const { session } = useAuth()
  const [students, setStudents] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [activeReview, setActiveReview] = useState(null)
  const [reason, setReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    let active = true
    getStudentsForReview(session.accessToken).then(({ data }) => active && setStudents(data)).catch((requestError) => active && setError(requestError.message)).finally(() => active && setIsLoading(false))
    return () => { active = false }
  }, [session.accessToken])

  async function submitReview(status) {
    if (!activeReview) return
    if (status === 'rejected' && reason.trim().length < 2) { setError('Provide a short reason before rejecting this student.'); return }
    setError(''); setSuccess(''); setIsSubmitting(true)
    try { await reviewStudent(session.accessToken, activeReview._id, { status, ...(status === 'rejected' ? { rejectionReason: reason.trim() } : {}) }); const { data } = await getStudentsForReview(session.accessToken); setStudents(data); setActiveReview(null); setReason(''); setSuccess(`Student ${status} successfully.`) } catch (requestError) { setError(requestError.message) } finally { setIsSubmitting(false) }
  }

  if (isLoading) return <LoadingState message="Loading student profiles for review…" />
  return <section className="space-y-8"><PageHeader eyebrow="Placement Admin" title="Student verification" description="Review pending student profiles and record one final verification decision." />{error && <ErrorState message={error} />}{success && <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800" role="status">{success}</p>}{students.length === 0 ? <EmptyState title="No student accounts yet" description="Student accounts will appear here once they register." /> : <div className="grid gap-5 xl:grid-cols-2">{students.map((student) => <StudentReviewCard key={student._id} student={student} onReview={() => { setActiveReview(student); setReason('') }} />)}</div>}{activeReview && <section className="rounded-2xl border border-violet-200 bg-violet-50 p-5 shadow-sm sm:p-6"><h2 className="text-xl font-bold text-slate-950">Review {activeReview.name}</h2><p className="mt-2 text-sm leading-6 text-slate-600">A decision is final in V2’s approved workflow. Only pending profiles can be reviewed.</p><div className="mt-4"><FormField as="textarea" rows="3" label="Rejection reason (required only if rejecting)" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain what the student needs to correct." /></div><div className="mt-5 flex flex-col gap-3 sm:flex-row"><Button className="sm:flex-1" disabled={isSubmitting || !canVerifyProfile(activeReview.profile)} onClick={() => submitReview('verified')}>{isSubmitting ? 'Saving…' : 'Verify student'}</Button><Button variant="danger" className="sm:flex-1" disabled={isSubmitting} onClick={() => submitReview('rejected')}>{isSubmitting ? 'Saving…' : 'Reject student'}</Button><Button variant="quiet" disabled={isSubmitting} onClick={() => setActiveReview(null)}>Cancel</Button></div></section>}</section>
}

function StudentReviewCard({ student, onReview }) {
  const profile = student.profile ?? {}
  const canVerify = canVerifyProfile(profile)
  return <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-950">{student.name}</h2><p className="mt-1 text-sm text-slate-600">{student.email}</p></div><StatusBadge status={profile.verificationStatus ?? 'pending'} /></div><dl className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-100 pt-5 text-sm"><Detail label="Branch" value={profile.branch ?? 'Not provided'} /><Detail label="Graduation" value={profile.graduationYear ?? 'Not provided'} /><Detail label="CGPA" value={profile.cgpa ?? 'Not provided'} /><Detail label="Backlogs" value={profile.activeBacklogs ?? 'Not provided'} /></dl><p className="mt-4 text-sm leading-6 text-slate-600"><span className="font-semibold text-slate-700">Skills:</span> {(profile.skills ?? []).join(', ') || 'Not provided'}</p>{profile.resume ? <p className="mt-2 text-sm text-emerald-700">Resume uploaded: {profile.resume.originalName}</p> : <p className="mt-2 text-sm text-slate-500">No resume uploaded.</p>}{profile.verificationStatus === 'pending' ? <><Button className="mt-5 w-full" onClick={onReview}>Review profile</Button>{!canVerify && <p className="mt-2 text-sm leading-6 text-amber-800">This student may be rejected with a reason, but needs academic details and a resume before verification.</p>}</> : profile.rejectionReason ? <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800"><span className="font-semibold">Reason:</span> {profile.rejectionReason}</p> : null}</article>
}

function Detail({ label, value }) { return <div><dt className="font-medium text-slate-500">{label}</dt><dd className="mt-1 font-semibold text-slate-800">{value}</dd></div> }

function canVerifyProfile(profile = {}) {
  return Boolean(profile.branch && profile.graduationYear && profile.cgpa !== undefined && profile.cgpa !== null && profile.activeBacklogs !== undefined && profile.activeBacklogs !== null && profile.resume)
}
