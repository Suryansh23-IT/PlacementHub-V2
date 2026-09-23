import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ErrorState } from '../components/feedback/ErrorState.jsx'
import { LoadingState } from '../components/feedback/LoadingState.jsx'
import { Button } from '../components/ui/Button.jsx'
import { FormField } from '../components/ui/FormField.jsx'
import { PageHeader } from '../components/ui/PageHeader.jsx'
import { StatusBadge } from '../components/ui/StatusBadge.jsx'
import { useAuth } from '../features/auth/useAuth.js'
import { downloadAdminStudentDocument, getStudentForReview, reviewStudent } from '../services/student.service.js'

export function AdminCandidateReviewPage() {
  const { id } = useParams()
  const { session } = useAuth()
  const [student, setStudent] = useState(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [documentError, setDocumentError] = useState('')
  const [busyDocument, setBusyDocument] = useState('')

  useEffect(() => {
    getStudentForReview(session.accessToken, id).then(({ data }) => setStudent(data)).catch((requestError) => setError(requestError.message))
  }, [id, session.accessToken])

  async function decide(status) {
    try {
      const { data } = await reviewStudent(session.accessToken, id, { status, ...(status === 'rejected' ? { rejectionReason: reason } : {}) })
      setStudent((current) => ({ ...current, profile: data }))
      setReason('')
    } catch (requestError) { setError(requestError.message) }
  }

  async function openDocument(type, originalName, mode) {
    setBusyDocument(`${type}-${mode}`)
    setDocumentError('')
    const viewer = mode === 'view' ? window.open('', '_blank') : null
    if (mode === 'view' && !viewer) {
      setBusyDocument('')
      setDocumentError('Your browser blocked the document viewer. Allow pop-ups for PlacementHub and try again.')
      return
    }
    try {
      const file = await downloadAdminStudentDocument(session.accessToken, id, type)
      const url = URL.createObjectURL(file)
      if (mode === 'view') { viewer.opener = null; viewer.location.href = url }
      else {
        const link = document.createElement('a')
        link.href = url
        link.download = originalName
        link.click()
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (requestError) { viewer?.close(); setDocumentError(requestError.message) } finally { setBusyDocument('') }
  }

  if (error) return <ErrorState message={error} />
  if (!student) return <LoadingState message="Loading candidate record…" />

  const profile = student.profile
  return <section className="space-y-6">
    <Link className="text-sm font-bold text-violet-700" to="/admin/students">← Student list</Link>
    <PageHeader eyebrow="Candidate review" title={student.name} description={`${profile.rollNumber ?? 'Roll number not provided'} · ${profile.branch ?? 'Branch not provided'}`} action={<StatusBadge status={profile.verificationStatus} />} />
    <Record title="Placement Agreement" items={[['Status', student.placementAgreement?.status === 'accepted' ? 'Accepted' : 'Not Accepted'], ['Policy title', student.placementAgreement?.title], ['Academic year', student.placementAgreement?.academicYear], ['Policy version', student.placementAgreement?.version], ['Accepted at', student.placementAgreement?.acceptedAt ? new Date(student.placementAgreement.acceptedAt).toLocaleString() : '—']]} />
    <Record title="Basic / college details" items={[['Email', student.email], ['Phone', profile.phone], ['Roll number', profile.rollNumber], ['Graduation', profile.graduationYear]]} />
    <Record title="Academics" items={[['CPI/CGPA', profile.cgpa], ['Backlogs', profile.activeBacklogs], ['Class 10', profile.class10?.board], ['Class 12', profile.class12?.board], ['Semester SPIs', (profile.semesterSpis ?? []).map((item) => `S${item.semester}: ${item.spi}`).join(', ') || 'Not provided']]} />
    <Record title="Skill groups" items={(profile.skillGroups ?? []).map((item, index) => [`${item.name || 'Skill group'} ${index + 1}`, item.skills.join(', ')])} />
    <Record title="Projects" items={(profile.projects ?? []).map((item, index) => [`${item.title || 'Project'} ${index + 1}`, <div key={`project-${index}`}><span>{item.description}</span>{item.technologies?.length ? <span className="mt-1 block text-slate-500">{item.technologies.join(', ')}</span> : null}{item.url && <SafeLink url={item.url} label="Open project" />}</div>])} />
    <Record title="Professional links" items={[['LinkedIn', <SafeLink key="linkedin" url={profile.professionalLinks?.linkedin} />], ['GitHub', <SafeLink key="github" url={profile.professionalLinks?.github} />], ['Portfolio', <SafeLink key="portfolio" url={profile.professionalLinks?.portfolio} />]]} />
    <Record title="Coding profiles" items={(profile.codingProfiles ?? []).map((item, index) => [`${item.platform || 'Coding profile'} ${index + 1}`, <SafeLink key={`coding-${index}`} url={item.url} label={item.url} />])} />
    <Record title="Documents" items={[
      ['Resume', <DocumentActions key="resume-actions" file={profile.resume} type="resume" busyDocument={busyDocument} onOpen={openDocument} absentLabel="Not uploaded" />],
      ['Class 10 marksheet', <DocumentActions key="class10-actions" file={profile.class10?.marksheet} type="class10" busyDocument={busyDocument} onOpen={openDocument} absentLabel="Not uploaded (optional)" />],
      ['Class 12 marksheet', <DocumentActions key="class12-actions" file={profile.class12?.marksheet} type="class12" busyDocument={busyDocument} onOpen={openDocument} absentLabel="Not uploaded (optional)" />],
      ['College result / grade sheet', <DocumentActions key="college-result-actions" file={profile.collegeResult} type="collegeResult" busyDocument={busyDocument} onOpen={openDocument} absentLabel="Not uploaded (required)" />],
    ]} />
    {documentError && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800" role="alert">{documentError}</p>}
    {profile.verificationStatus === 'pending' && <section className="rounded-2xl border border-violet-200 bg-violet-50 p-5"><FormField as="textarea" rows="3" label="Rejection reason" value={reason} onChange={(event) => setReason(event.target.value)} /><div className="mt-4 flex flex-wrap gap-3"><Button onClick={() => decide('verified')}>Verify</Button><Button variant="danger" onClick={() => decide('rejected')} disabled={reason.trim().length < 2}>Reject</Button></div></section>}
  </section>
}

function DocumentActions({ file, type, busyDocument, onOpen, absentLabel }) {
  if (!file) return <span className="text-slate-500">{absentLabel}</span>
  return <div className="flex flex-wrap items-center gap-2"><span className="max-w-48 truncate text-slate-800">{file.originalName}</span><Button variant="secondary" className="min-h-9 px-3 py-1.5" disabled={Boolean(busyDocument)} onClick={() => onOpen(type, file.originalName, 'view')}>{busyDocument === `${type}-view` ? 'Opening…' : 'View'}</Button><Button variant="secondary" className="min-h-9 px-3 py-1.5" disabled={Boolean(busyDocument)} onClick={() => onOpen(type, file.originalName, 'download')}>{busyDocument === `${type}-download` ? 'Downloading…' : 'Download'}</Button></div>
}

function SafeLink({ url, label = 'Open link' }) { return url ? <a className="mt-1 inline-block font-semibold text-violet-700 hover:underline" href={url} target="_blank" rel="noreferrer noopener">{label}</a> : <span className="text-slate-500">Not provided</span> }

function Record({ title, items }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold">{title}</h2>{items.length ? <dl className="mt-3 grid gap-3 sm:grid-cols-2">{items.map(([label, value], index) => <div key={`${label}-${index}`}><dt className="text-xs font-bold text-slate-500">{label}</dt><dd className="mt-1 text-sm text-slate-800">{value ?? 'Not provided'}</dd></div>)}</dl> : <p className="mt-3 text-sm text-slate-500">Not provided.</p>}</section>
}
