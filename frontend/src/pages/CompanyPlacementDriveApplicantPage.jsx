import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ErrorState } from '../components/feedback/ErrorState.jsx'
import { LoadingState } from '../components/feedback/LoadingState.jsx'
import { DriveContextHeader } from '../components/placement-drives/DriveContextHeader.jsx'
import { Button } from '../components/ui/Button.jsx'
import { FormField } from '../components/ui/FormField.jsx'
import { PageHeader } from '../components/ui/PageHeader.jsx'
import { StatusBadge } from '../components/ui/StatusBadge.jsx'
import { CompanyCandidateIntelligence } from '../features/ai/CompanyIntelligence.jsx'
import { useAuth } from '../features/auth/useAuth.js'
import { createCompanyIncidentReport, downloadCompanyDriveApplicantResume, getCompanyDriveApplicant } from '../services/company-drive-applicant.service.js'

const titleCase = value => value ? value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase()) : 'Not specified'
const dateLabel = value => value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : 'Not specified'

export function CompanyPlacementDriveApplicantPage() {
  const { id, studentId } = useParams()
  const { session } = useAuth()
  const [applicant, setApplicant] = useState(null)
  const [error, setError] = useState('')
  const [resumeError, setResumeError] = useState('')
  const [busyResume, setBusyResume] = useState('')
  const [incident, setIncident] = useState({ category: 'withdrawal', description: '', note: '' })
  const [incidentBusy, setIncidentBusy] = useState(false)
  const [incidentMessage, setIncidentMessage] = useState('')

  useEffect(() => {
    let active = true
    getCompanyDriveApplicant(session.accessToken, id, studentId).then(({ data }) => { if (active) setApplicant(data) }).catch(error => { if (active) setError(error.message) })
    return () => { active = false }
  }, [id, session.accessToken, studentId])

  async function openResume(mode) {
    if (busyResume) return
    setResumeError('')
    const viewer = mode === 'view' ? window.open('', '_blank') : null
    if (mode === 'view' && !viewer) {
      setResumeError('Your browser blocked the resume viewer. Allow pop-ups for PlacementHub and try again.')
      return
    }
    if (viewer) viewer.opener = null
    setBusyResume(mode)
    try {
      const blob = await downloadCompanyDriveApplicantResume(session.accessToken, id, studentId)
      const url = URL.createObjectURL(blob)
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
      if (viewer) viewer.location.href = url
      else {
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = applicant.student?.resume?.originalName || 'resume.pdf'
        anchor.click()
      }
    } catch (error) { viewer?.close(); setResumeError(error.message) } finally { setBusyResume('') }
  }

  async function submitIncident(event) {
    event.preventDefault()
    if (incidentBusy) return
    setIncidentBusy(true); setIncidentMessage(''); setError('')
    try {
      await createCompanyIncidentReport(session.accessToken, { applicationId: applicant.applicationId, ...incident })
      setIncident({ category: 'withdrawal', description: '', note: '' })
      setIncidentMessage('Incident report sent to Placement Administration for review.')
    } catch (error) { setError(error.message) } finally { setIncidentBusy(false) }
  }

  const back = <Link className="text-sm font-bold text-blue-700" to={`/company/placement-drives/${id}/applicants`}>← Recruitment workspace</Link>
  if (error) return <section className="space-y-6">{back}<ErrorState message={error} /></section>
  if (!applicant) return <LoadingState message="Loading applicant profile…" />
  const student = applicant.student || {}
  const links = Object.entries(student.professionalLinks || {}).filter(([, url]) => Boolean(url))

  return <section className="space-y-6">
    {back}
    <PageHeader eyebrow={applicant.drive?.role?.title || 'Placement Drive'} title={student.name || 'Applicant'} description={`${student.rollNumber || 'Enrollment number not available'} · Applied ${dateLabel(applicant.appliedAt)}`} action={<StatusBadge status="neutral">Phase {applicant.currentPhase} · {titleCase(applicant.currentStatus)}</StatusBadge>} />
    <DriveContextHeader drive={applicant.drive} />
    <CompanyCandidateIntelligence token={session.accessToken} driveId={id} studentId={studentId} />
    <Record title="Applicant summary" items={[["Branch", student.branch], ["CGPA / CPI", student.cgpa], ["Active backlogs", student.activeBacklogs], ["Graduation year", student.graduationYear], ["Applied at", dateLabel(applicant.appliedAt)]]} />
    <form className="rounded-2xl border border-amber-200 bg-amber-50 p-5" onSubmit={submitIncident}><h2 className="font-bold text-amber-950">Report incident / request placement action</h2><p className="mt-1 text-sm text-amber-900">Placement Administration reviews reports and decides any institutional action. Companies cannot impose restrictions directly.</p><div className="mt-4 grid gap-4 sm:grid-cols-2"><FormField as="select" label="Incident category" value={incident.category} onChange={event => setIncident(current => ({ ...current, category: event.target.value }))}><option value="withdrawal">Withdrawal</option><option value="absent">Absent</option><option value="cheating">Cheating</option><option value="misconduct">Misconduct</option><option value="rule_violation">Rule violation</option><option value="document_or_information_issue">Document or information issue</option><option value="other">Other</option></FormField><FormField required as="textarea" rows="3" label="Reason" value={incident.description} onChange={event => setIncident(current => ({ ...current, description: event.target.value }))} /></div><div className="mt-4"><FormField as="textarea" rows="2" label="Optional note" value={incident.note} onChange={event => setIncident(current => ({ ...current, note: event.target.value }))} /></div><div className="mt-4 flex flex-wrap items-center gap-3"><Button type="submit" disabled={incidentBusy}>{incidentBusy ? 'Submitting…' : 'Submit to Placement Admin'}</Button>{incidentMessage && <p role="status" className="text-sm font-semibold text-emerald-800">{incidentMessage}</p>}</div></form>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-950">Resume</h2><p className="mt-1 break-words text-sm text-slate-600">{student.resume?.originalName || 'No resume uploaded'}</p>{student.resume && <div className="mt-4 flex flex-wrap gap-2"><Button variant="secondary" disabled={Boolean(busyResume)} onClick={() => openResume('view')}>{busyResume === 'view' ? 'Opening…' : 'View'}</Button><Button variant="secondary" disabled={Boolean(busyResume)} onClick={() => openResume('download')}>{busyResume === 'download' ? 'Downloading…' : 'Download'}</Button></div>}{resumeError && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{resumeError}</p>}</section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-950">Skills</h2><div className="mt-4 flex flex-wrap gap-2">{[...(student.skills || []), ...(student.skillGroups || []).flatMap(group => group.skills || [])].filter((skill, index, values) => values.indexOf(skill) === index).map(skill => <span key={skill} className="rounded-full bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-800">{skill}</span>) || null}</div>{!(student.skills?.length || student.skillGroups?.length) && <p className="mt-3 text-sm text-slate-600">No skills listed.</p>}</section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-950">Projects</h2>{student.projects?.length ? <div className="mt-4 grid gap-3">{student.projects.map(project => <article key={project._id || project.title} className="rounded-xl border border-slate-200 p-4"><h3 className="font-semibold">{project.title}</h3><p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{project.description}</p>{project.technologies?.length > 0 && <p className="mt-3 text-sm text-slate-700"><strong>Technologies:</strong> {project.technologies.join(', ')}</p>}{project.url && <a className="mt-3 inline-flex text-sm font-bold text-blue-700 hover:underline" href={project.url} target="_blank" rel="noreferrer">Project link</a>}</article>)}</div> : <p className="mt-3 text-sm text-slate-600">No projects listed.</p>}</section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-950">Professional and coding profiles</h2>{links.length || student.codingProfiles?.length ? <div className="mt-4 flex flex-wrap gap-3">{links.map(([name, url]) => <ExternalLink key={name} label={titleCase(name)} url={url} />)}{(student.codingProfiles || []).map(profile => <ExternalLink key={profile._id || `${profile.platform}-${profile.url}`} label={profile.platform} url={profile.url} />)}</div> : <p className="mt-3 text-sm text-slate-600">No professional or coding profiles listed.</p>}</section>
  </section>
}

function Record({ title, items }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-950">{title}</h2><dl className="mt-3 grid gap-3 sm:grid-cols-2">{items.map(([label, value]) => <div key={label}><dt className="text-xs font-bold text-slate-500">{label}</dt><dd className="mt-1 text-sm text-slate-800">{value === '' || value == null ? 'Not specified' : value}</dd></div>)}</dl></section>
}

function ExternalLink({ label, url }) {
  return <a className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800" href={url} target="_blank" rel="noreferrer">{label}</a>
}
