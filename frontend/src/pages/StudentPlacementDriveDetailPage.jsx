import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ErrorState } from '../components/feedback/ErrorState.jsx'
import { LoadingState } from '../components/feedback/LoadingState.jsx'
import { Button } from '../components/ui/Button.jsx'
import { PageHeader } from '../components/ui/PageHeader.jsx'
import { StatusBadge } from '../components/ui/StatusBadge.jsx'
import { useAuth } from '../features/auth/useAuth.js'
import { applyToStudentPlacementDrive, downloadStudentPlacementDriveDocument, getStudentPlacementDrive } from '../services/student-placement-drive.service.js'

const titleCase = value => value ? value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase()) : 'Not specified'
const dateLabel = value => value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : 'Not specified'
const list = value => value?.length ? value.join(', ') : 'Not specified'

function compensationLabel(drive) {
  const compensation = drive.driveDetails?.compensation
  if (!compensation || compensation.period === 'not_disclosed' || compensation.amount == null) return 'Not disclosed'
  const period = { per_annum: 'per annum', per_month: 'per month', stipend: 'stipend' }[compensation.period] || compensation.period
  return `${compensation.currency || 'INR'} ${Number(compensation.amount).toLocaleString()} ${period}`
}

export function StudentPlacementDriveDetailPage() {
  const { id } = useParams()
  const { session } = useAuth()
  const [drive, setDrive] = useState(null)
  const [error, setError] = useState('')
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState('')
  const [applyReasons, setApplyReasons] = useState([])
  const [success, setSuccess] = useState('')
  const [busyDocument, setBusyDocument] = useState('')
  const [documentError, setDocumentError] = useState('')

  useEffect(() => {
    let active = true
    getStudentPlacementDrive(session.accessToken, id).then(({ data }) => { if (active) setDrive(data) }).catch(error => { if (active) setError(error.message) })
    return () => { active = false }
  }, [id, session.accessToken])

  async function apply() {
    if (!drive || drive.hasApplied || !drive.eligibilityResult?.eligible || applying) return
    setApplying(true)
    setApplyError('')
    setApplyReasons([])
    setSuccess('')
    try {
      const { data } = await applyToStudentPlacementDrive(session.accessToken, id)
      setDrive(current => ({ ...current, hasApplied: true, application: { _id: data._id, currentPhase: data.currentPhase, currentStatus: data.currentStatus } }))
      setSuccess('Your application was submitted and entered Phase 0.')
    } catch (error) {
      setApplyError(error.message)
      setApplyReasons(Array.isArray(error.details) ? error.details : [])
      if (error.statusCode === 409) setDrive(current => ({ ...current, hasApplied: true }))
    } finally { setApplying(false) }
  }

  async function openDocument(type, mode) {
    if (busyDocument) return
    setDocumentError('')
    const viewer = mode === 'view' ? window.open('', '_blank') : null
    if (mode === 'view' && !viewer) {
      setDocumentError('Your browser blocked the document viewer. Allow pop-ups for PlacementHub and try again.')
      return
    }
    if (viewer) viewer.opener = null
    setBusyDocument(`${type}:${mode}`)
    try {
      const blob = await downloadStudentPlacementDriveDocument(session.accessToken, id, type)
      const url = URL.createObjectURL(blob)
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
      if (viewer) viewer.location.href = url
      else {
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = drive.documents?.[type]?.originalName || 'placement-drive-document.pdf'
        anchor.click()
      }
    } catch (error) { viewer?.close(); setDocumentError(error.message) } finally { setBusyDocument('') }
  }

  const back = <Link className="text-sm font-bold text-blue-700" to="/student/placement?tab=open">← Open Placement Drives</Link>
  if (error) return <section className="space-y-6">{back}<ErrorState message={error} /></section>
  if (!drive) return <LoadingState message="Loading Placement Drive…" />
  const eligible = drive.eligibilityResult?.eligible
  const reasons = drive.eligibilityResult?.reasons || []
  const applicationWindow = drive.applicationWindow
  const existingApplication = drive.hasApplied && drive.application
  const phases = [...(drive.phases || [])].filter(phase => phase.phaseNumber >= 1).sort((a, b) => a.phaseNumber - b.phaseNumber)

  return <section className="space-y-6">
    {back}
    <PageHeader eyebrow={drive.company?.companyName || 'Company'} title={drive.role?.title || 'Placement Drive'} description={`${drive.role?.domain || 'Placement opportunity'} · ${applicationWindowLabel(drive)}`} action={<StatusBadge status={applicationWindow?.open ? 'approved' : 'neutral'}>{applicationWindow?.open ? 'Applications open' : 'Applications closed'}</StatusBadge>} />
    {existingApplication ? <ExistingApplication application={existingApplication} applicationWindow={applicationWindow} /> : <Eligibility eligible={eligible} reasons={reasons} />}
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold text-slate-950">Application</h2><p className="mt-1 text-sm text-slate-600">{applicationWindowLabel(drive)}. Applications begin in Phase 0, the applicant and screening pool.</p></div>{existingApplication ? <StatusBadge status="neutral">{existingApplication.currentStatus === 'withdrawn' ? 'Withdrawn' : `${titleCase(existingApplication.currentStatus)} · Phase ${existingApplication.currentPhase}`}</StatusBadge> : <Button disabled={!eligible || applying || !applicationWindow?.open} onClick={apply}>{applying ? 'Applying…' : 'Apply to Drive'}</Button>}</div>{existingApplication?.currentStatus === 'withdrawn' && <p className="mt-4 text-sm text-slate-600">This application was withdrawn and cannot be reactivated. View My Applications for its history.</p>}{!existingApplication && (!eligible || !applicationWindow?.open) && <p className="mt-4 text-sm text-slate-600">{applicationWindow?.open ? 'You can apply when you meet this drive’s eligibility requirements.' : applicationWindowLabel(drive)}</p>}{success && <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{success}</p>}{applyError && <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><p>{applyError}</p>{applyReasons.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5">{applyReasons.map((reason, index) => <li key={`${reason.code || 'reason'}-${index}`}>{reason.message}</li>)}</ul>}</div>}</section>
    <Record title="Company summary" items={[["Company", drive.company?.companyName], ["Industry", drive.company?.industry], ["Headquarters", drive.company?.location], ["Website", drive.company?.website], ["Recruiter / SPOC", [drive.company?.recruiter?.name, drive.company?.recruiter?.designation].filter(Boolean).join(' · ')], ["Official contact", drive.company?.officialEmail || drive.company?.recruiter?.email]]} />
    <Record title="Role and job details" items={[["Role", drive.role?.title], ["Category / domain", drive.role?.domain], ["Hiring type", titleCase(drive.role?.employmentType)], ["Compensation", compensationLabel(drive)], ["Openings", drive.driveDetails?.expectedHires], ["Location", drive.driveDetails?.workLocation], ["Work mode", titleCase(drive.driveDetails?.workMode)], ["Joining period", drive.driveDetails?.joiningPeriod], ["Required skills", list(drive.role?.requiredSkills)], ["Job description / instructions", drive.role?.description]]} />
    <Record title="Eligibility criteria" items={[["Eligible branches", list(drive.eligibility?.allowedBranches)], ["Minimum CGPA / CPI", drive.eligibility?.minimumCgpa], ["Maximum active backlogs", drive.eligibility?.maximumActiveBacklogs], ["Graduation years", list(drive.eligibility?.graduationYears)], ["Additional requirements", drive.eligibility?.additionalRequirements]]} />
    <Documents documents={drive.documents} busyDocument={busyDocument} openDocument={openDocument} />
    {documentError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{documentError}</p>}
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-950">Recruitment plan</h2><p className="mt-1 text-sm text-slate-600">Phase 0 is your application and screening pool. The company has outlined these later phases.</p><div className="mt-4 grid gap-3">{phases.length ? phases.map(phase => <article key={phase.phaseNumber} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Phase {phase.phaseNumber}: {phase.title}</h3><StatusBadge status="neutral">{titleCase(phase.type)}</StatusBadge></div>{phase.description && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{phase.description}</p>}</article>) : <p className="text-sm text-slate-600">The recruitment phase plan is not available.</p>}</div></section>
  </section>
}

function applicationWindowLabel(drive) {
  if (drive.applicationWindow?.open) return `${drive.applicationDeadlineExtendedAt ? 'Deadline extended to' : 'Applications open until'} ${dateLabel(drive.applicationDeadline || drive.driveDetails?.applicationDeadline)}`
  return drive.applicationWindow?.reason === 'deadline_passed' ? 'Application deadline passed' : 'Applications closed'
}

function Eligibility({ eligible, reasons }) {
  if (eligible) return <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><h2 className="font-bold text-emerald-950">You are eligible for this drive</h2><p className="mt-1 text-sm text-emerald-800">Your profile currently meets the published requirements. Eligibility is checked again when you apply.</p></section>
  return <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><h2 className="font-bold text-amber-950">You are not currently eligible</h2><p className="mt-1 text-sm text-amber-900">The result below comes from this drive’s published requirements.</p>{reasons.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-900">{reasons.map((reason, index) => <li key={`${reason.code || 'reason'}-${index}`}>{reason.message}</li>)}</ul>}</section>
}

function ExistingApplication({ application, applicationWindow }) {
  const withdrawn = application.currentStatus === 'withdrawn'
  return <section className={`rounded-2xl border p-5 ${withdrawn ? 'border-slate-200 bg-slate-50' : 'border-emerald-200 bg-emerald-50'}`}><h2 className={`font-bold ${withdrawn ? 'text-slate-950' : 'text-emerald-950'}`}>{withdrawn ? 'Application withdrawn' : 'Application submitted'}</h2><p className={`mt-1 text-sm ${withdrawn ? 'text-slate-700' : 'text-emerald-800'}`}>{withdrawn ? 'This retained application cannot be reactivated.' : `Your application remains ${titleCase(application.currentStatus)} in Phase ${application.currentPhase}.`}{!applicationWindow?.open && !withdrawn ? ' Applications are currently closed for new applicants.' : ''}</p></section>
}

function Documents({ documents, busyDocument, openDocument }) {
  const documentTypes = [['companyRecruitmentInformation', 'Company / Recruitment Information PDF'], ['placementDriveJobDescription', 'Placement Drive / JD PDF']]
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-950">Documents</h2><div className="mt-4 grid gap-4 md:grid-cols-2">{documentTypes.map(([type, label]) => { const file = documents?.[type]; return <article key={type} className="rounded-xl border border-slate-200 p-4"><h3 className="font-semibold">{label}</h3><p className="mt-2 break-words text-sm text-slate-600">{file?.originalName || 'Not available'}</p>{file?.originalName && <div className="mt-4 flex flex-wrap gap-2"><Button variant="secondary" disabled={Boolean(busyDocument)} onClick={() => openDocument(type, 'view')}>{busyDocument === `${type}:view` ? 'Opening…' : 'View'}</Button><Button variant="secondary" disabled={Boolean(busyDocument)} onClick={() => openDocument(type, 'download')}>{busyDocument === `${type}:download` ? 'Downloading…' : 'Download'}</Button></div>}</article> })}</div></section>
}

function Record({ title, items }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-950">{title}</h2><dl className="mt-3 grid gap-3 sm:grid-cols-2">{items.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs font-bold text-slate-500">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">{value === '' || value == null ? 'Not specified' : value}</dd></div>)}</dl></section>
}
