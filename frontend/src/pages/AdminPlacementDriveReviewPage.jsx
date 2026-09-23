import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { ErrorState } from '../components/feedback/ErrorState.jsx'
import { LoadingState } from '../components/feedback/LoadingState.jsx'
import { Button } from '../components/ui/Button.jsx'
import { FormField } from '../components/ui/FormField.jsx'
import { PageHeader } from '../components/ui/PageHeader.jsx'
import { StatusBadge } from '../components/ui/StatusBadge.jsx'
import { useAuth } from '../features/auth/useAuth.js'
import { getCompanies } from '../services/company.service.js'
import { downloadAdminPlacementDriveDocument, getAdminPlacementDrive, reviewAdminPlacementDrive } from '../services/placement-drive.service.js'

const reasonSchema = z.string().trim().min(2, 'Provide feedback of at least 2 characters.').max(1500, 'Use at most 1500 characters.')
const list = value => value?.length ? value.join(', ') : null
const titleCase = value => value ? value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase()) : null
const dateLabel = value => value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : null

function compensationLabel(drive) {
  const compensation = drive.driveDetails?.compensation
  if (!compensation || compensation.period === 'not_disclosed' || compensation.amount == null) return 'Not disclosed'
  const period = { per_annum: 'per annum', per_month: 'per month', stipend: 'stipend' }[compensation.period] || compensation.period
  return `${compensation.currency || 'INR'} ${Number(compensation.amount).toLocaleString()} ${period}`
}

export function AdminPlacementDriveReviewPage() {
  const { id } = useParams()
  const { session } = useAuth()
  return <ProposalReviewRecord key={`${id}:${session.accessToken}`} id={id} session={session} />
}

function ProposalReviewRecord({ id, session }) {
  const [search] = useSearchParams()
  const [drive, setDrive] = useState(null)
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState('')
  const [decision, setDecision] = useState('')
  const [documentError, setDocumentError] = useState('')
  const [busyDocument, setBusyDocument] = useState('')
  const filter = ['submitted', 'changes_requested', 'approved', 'rejected', 'all'].includes(search.get('status')) ? search.get('status') : 'submitted'

  useEffect(() => {
    let active = true
    Promise.all([getAdminPlacementDrive(session.accessToken, id), getCompanies(session.accessToken)])
      .then(([driveResponse, companyResponse]) => {
        if (!active) return
        setDrive(driveResponse.data)
        setCompanies(companyResponse.data)
      })
      .catch(error => { if (active) setError(error.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [id, session.accessToken])

  const company = useMemo(() => companies.find(item => String(item.company?._id) === String(drive?.companyId)), [companies, drive?.companyId])

  async function decide(nextDecision) {
    if (!drive || decision || drive.proposalStatus !== 'submitted') return
    const needsReason = nextDecision !== 'approved'
    const result = reasonSchema.safeParse(reason)
    if (needsReason && !result.success) {
      setReasonError(result.error.issues[0].message)
      return
    }
    setDecision(nextDecision)
    setError('')
    setSuccess('')
    setReasonError('')
    try {
      const { data } = await reviewAdminPlacementDrive(session.accessToken, id, { decision: nextDecision, ...(needsReason ? { reason: result.data } : {}) })
      setDrive(data)
      setReason('')
      setSuccess(nextDecision === 'approved' ? 'Proposal approved successfully.' : nextDecision === 'rejected' ? 'Proposal rejected successfully.' : 'Changes were requested successfully.')
    } catch (error) { setError(error.message) } finally { setDecision('') }
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
      const blob = await downloadAdminPlacementDriveDocument(session.accessToken, id, type)
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

  const back = <Link className="text-sm font-bold text-violet-700" to={`/admin/placement-drives?status=${filter}`}>← Placement proposals</Link>
  if (loading) return <LoadingState message="Loading Placement Drive proposal…" />
  if (!drive) return <section className="space-y-6">{back}<ErrorState message={error || 'Placement Drive proposal could not be loaded.'} /></section>
  const profile = company?.company || {}
  const canReview = drive.proposalStatus === 'submitted'
  const phases = [...(drive.phases || [])].filter(phase => phase.phaseNumber >= 1).sort((left, right) => left.phaseNumber - right.phaseNumber)
  const feedback = drive.review?.requestedChanges || drive.review?.rejectionReason

  return <section className="space-y-6">
    {back}
    <PageHeader eyebrow="Placement proposal review" title={drive.role?.title || 'Placement Drive'} description={drive.role?.domain || 'Role details'} action={<div className="flex flex-wrap justify-end gap-2"><StatusBadge status={drive.proposalStatus} /><StatusBadge status={drive.lifecycleStatus} /></div>} />
    {feedback && <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><h2 className="font-bold text-amber-950">Previous Admin feedback</h2><p className="mt-2 whitespace-pre-wrap text-sm text-amber-900">{feedback}</p></section>}
    <Record title="Company summary" items={[
      ['Company name', profile.companyName || company?.name], ['Recruiter / SPOC', [profile.recruiterName, profile.recruiterDesignation].filter(Boolean).join(' · ')], ['Official email', profile.officialEmail || profile.recruiterEmail], ['Phone', profile.recruiterPhone], ['Website', profile.website],
    ]} />
    <Record title="Job / Drive details" items={[
      ['Role', drive.role?.title], ['Category / domain', drive.role?.domain], ['Hiring type', titleCase(drive.role?.employmentType)], ['Package / CTC', compensationLabel(drive)], ['Openings', drive.driveDetails?.expectedHires], ['Work location', drive.driveDetails?.workLocation], ['Work mode', titleCase(drive.driveDetails?.workMode)], ['Application deadline', dateLabel(drive.driveDetails?.applicationDeadline)], ['Tentative schedule', null], ['Joining period', drive.driveDetails?.joiningPeriod], ['Service bond', drive.driveDetails?.serviceBond], ['Required skills', list(drive.role?.requiredSkills)], ['Job description / instructions', drive.role?.description],
    ]} />
    <Record title="Eligibility rules" items={[
      ['Target branches', list(drive.eligibility?.allowedBranches)], ['Minimum CGPA / CPI', drive.eligibility?.minimumCgpa], ['Maximum active backlogs', drive.eligibility?.maximumActiveBacklogs], ['Graduation years', list(drive.eligibility?.graduationYears)], ['10th criteria', null], ['12th criteria', null], ['Additional requirements', drive.eligibility?.additionalRequirements],
    ]} />
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold">Recruitment plan</h2><p className="mt-1 text-sm text-slate-600">Company-defined phases only. Phase 0 is reserved for the applicant and screening pool.</p><div className="mt-4 grid gap-4">{phases.map(phase => <article key={phase.phaseNumber} className="rounded-xl border border-slate-200 p-4"><div className="flex items-center justify-between gap-3"><h3 className="font-bold">Phase {phase.phaseNumber}: {phase.title}</h3><StatusBadge status="neutral">{titleCase(phase.type)}</StatusBadge></div><dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2"><Detail label="Mode" value={null} /><Detail label="Date / time" value={null} /><Detail label="External link" value={null} /><Detail label="Instructions" value={phase.description} /></dl></article>)}</div></section>
    <Documents documents={drive.documents} busyDocument={busyDocument} openDocument={openDocument} />
    {documentError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{documentError}</p>}
    <Record title="Proposal status" items={[
      ['Current proposal status', titleCase(drive.proposalStatus)], ['Drive lifecycle', titleCase(drive.lifecycleStatus)], ['Last reviewed', dateLabel(drive.review?.reviewedAt)], ['Changes requested', drive.review?.requestedChanges], ['Rejection reason', drive.review?.rejectionReason],
    ]} />
    {error && <ErrorState message={error} />}
    {success && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{success}</p>}
    {canReview && <section className="rounded-2xl border border-violet-200 bg-violet-50 p-5"><h2 className="font-bold">Review decision</h2><div className="mt-4"><FormField as="textarea" rows="4" label="Feedback (required to request changes or reject)" hint="2–1500 characters. Not required for approval." maxLength={1500} value={reason} error={reasonError} disabled={Boolean(decision)} onChange={event => { setReason(event.target.value); setReasonError('') }} /></div><div className="mt-4 flex flex-wrap gap-3"><Button disabled={Boolean(decision)} onClick={() => decide('approved')}>{decision === 'approved' ? 'Approving…' : 'Approve'}</Button><Button variant="secondary" disabled={Boolean(decision)} onClick={() => decide('changes_requested')}>{decision === 'changes_requested' ? 'Sending…' : 'Request Changes'}</Button><Button variant="danger" disabled={Boolean(decision)} onClick={() => decide('rejected')}>{decision === 'rejected' ? 'Rejecting…' : 'Reject'}</Button></div></section>}
  </section>
}

function Documents({ documents, busyDocument, openDocument }) {
  const documentTypes = [['companyRecruitmentInformation', 'Company / Recruitment Information PDF'], ['placementDriveJobDescription', 'Placement Drive / JD PDF']]
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold">Documents</h2><div className="mt-4 grid gap-4 md:grid-cols-2">{documentTypes.map(([type, label]) => {
    const file = documents?.[type]
    return <article key={type} className="rounded-xl border border-slate-200 p-4"><h3 className="font-semibold">{label}</h3><p className="mt-2 text-sm text-slate-600">{file?.originalName || 'Not uploaded'}</p>{file?.originalName && <div className="mt-4 flex flex-wrap gap-2"><Button variant="secondary" disabled={Boolean(busyDocument)} onClick={() => openDocument(type, 'view')}>{busyDocument === `${type}:view` ? 'Opening…' : 'View'}</Button><Button variant="secondary" disabled={Boolean(busyDocument)} onClick={() => openDocument(type, 'download')}>{busyDocument === `${type}:download` ? 'Downloading…' : 'Download'}</Button></div>}</article>
  })}</div></section>
}

function Record({ title, items }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold">{title}</h2><dl className="mt-3 grid gap-3 sm:grid-cols-2">{items.map(([label, value]) => <Detail key={label} label={label} value={value} />)}</dl></section>
}

function Detail({ label, value }) {
  return <div className="min-w-0"><dt className="text-xs font-bold text-slate-500">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">{value === '' || value == null ? 'Not specified' : value}</dd></div>
}
