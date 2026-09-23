import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ErrorState } from '../components/feedback/ErrorState.jsx'
import { LoadingState } from '../components/feedback/LoadingState.jsx'
import { Button } from '../components/ui/Button.jsx'
import { FormField } from '../components/ui/FormField.jsx'
import { PageHeader } from '../components/ui/PageHeader.jsx'
import { StatusBadge } from '../components/ui/StatusBadge.jsx'
import { useAuth } from '../features/auth/useAuth.js'
import { createMyPlacementDrive, downloadMyPlacementDriveDocument, getMyPlacementDrive, getMyPlacementDriveBranches, resubmitMyPlacementDrive, submitMyPlacementDrive, updateMyPlacementDrive, uploadMyPlacementDriveDocument } from '../services/placement-drive.service.js'

const blank = {
  role: { title: '', domain: '', employmentType: 'full_time', description: '', requiredSkills: '' },
  driveDetails: { workMode: 'hybrid', workLocation: '', expectedHires: '', compensation: { amount: '', currency: 'INR', period: 'not_disclosed' }, applicationDeadline: '', joiningPeriod: '', serviceBond: '' },
  eligibility: { minimumCgpa: '', allowedBranches: [], maximumActiveBacklogs: '0', graduationYears: '', additionalRequirements: '' },
  phases: [{ phaseNumber: 1, title: '', type: 'assessment', description: '' }],
}
const editableStatuses = ['draft', 'changes_requested']
const documentRows = [
  ['companyRecruitmentInformation', 'Company / Recruitment Information PDF'],
  ['placementDriveJobDescription', 'Placement Drive / JD PDF'],
]

const toDateInput = value => value ? new Date(value).toISOString().slice(0, 10) : ''
const commaList = value => String(value ?? '').split(',').map(item => item.trim()).filter(Boolean)
const formFromDrive = drive => ({
  role: { ...blank.role, ...drive.role, requiredSkills: (drive.role?.requiredSkills ?? []).join(', ') },
  driveDetails: { ...blank.driveDetails, ...drive.driveDetails, applicationDeadline: toDateInput(drive.driveDetails?.applicationDeadline), compensation: { ...blank.driveDetails.compensation, ...drive.driveDetails?.compensation, amount: drive.driveDetails?.compensation?.amount ?? '' } },
  eligibility: { ...blank.eligibility, ...drive.eligibility, allowedBranches: drive.eligibility?.allowedBranches ?? [], graduationYears: (drive.eligibility?.graduationYears ?? []).join(', ') },
  phases: (drive.phases ?? []).map(phase => ({ ...phase, description: phase.description ?? '' })),
})
function proposalPayload(form) {
  const amount = form.driveDetails.compensation.amount
  return {
    role: { ...form.role, requiredSkills: commaList(form.role.requiredSkills) },
    driveDetails: { ...form.driveDetails, expectedHires: Number(form.driveDetails.expectedHires), applicationDeadline: form.driveDetails.applicationDeadline, compensation: { ...form.driveDetails.compensation, ...(amount === '' ? {} : { amount: Number(amount) }) } },
    eligibility: { ...form.eligibility, minimumCgpa: Number(form.eligibility.minimumCgpa), maximumActiveBacklogs: Number(form.eligibility.maximumActiveBacklogs), allowedBranches: form.eligibility.allowedBranches, graduationYears: commaList(form.eligibility.graduationYears).map(Number) },
    phases: form.phases.map((phase, index) => ({ ...phase, phaseNumber: index + 1 })),
  }
}

export function CompanyPlacementDriveFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const [drive, setDrive] = useState(null)
  const [form, setForm] = useState(blank)
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(Boolean(id))
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [busyDocument, setBusyDocument] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (!id) return
    let active = true
    getMyPlacementDrive(session.accessToken, id).then(({ data }) => { if (active) { setDrive(data); setForm(formFromDrive(data)) } }).catch(error => { if (active) setError(error.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [id, session.accessToken])
  useEffect(() => {
    let active = true
    getMyPlacementDriveBranches(session.accessToken).then(({ data }) => { if (active) setBranches(data) }).catch(error => { if (active) setError(error.message) })
    return () => { active = false }
  }, [session.accessToken])

  const editable = !drive || editableStatuses.includes(drive.proposalStatus)
  const busy = saving || submitting || Boolean(busyDocument)
  const change = (group, key, value) => setForm(current => ({ ...current, [group]: { ...current[group], [key]: value } }))
  const toggleAllowedBranch = branch => setForm(current => {
    const allowedBranches = current.eligibility.allowedBranches.includes(branch)
      ? current.eligibility.allowedBranches.filter(value => value !== branch)
      : [...current.eligibility.allowedBranches, branch]
    return { ...current, eligibility: { ...current.eligibility, allowedBranches } }
  })
  const changeCompensation = (key, value) => setForm(current => ({ ...current, driveDetails: { ...current.driveDetails, compensation: { ...current.driveDetails.compensation, [key]: value } } }))
  const changePhase = (index, key, value) => setForm(current => ({ ...current, phases: current.phases.map((phase, phaseIndex) => phaseIndex === index ? { ...phase, [key]: value } : phase) }))

  async function persist() {
    const payload = proposalPayload(form)
    const wasNew = !drive
    const response = drive ? await updateMyPlacementDrive(session.accessToken, drive._id, payload) : await createMyPlacementDrive(session.accessToken, payload)
    setDrive(response.data)
    setForm(formFromDrive(response.data))
    if (wasNew) navigate(`/company/placement-drives/${response.data._id}`, { replace: true })
    return response.data
  }
  async function save(event) {
    event.preventDefault()
    if (busy || !editable) return
    setSaving(true); setError(''); setSuccess('')
    try { await persist(); setSuccess('Placement Drive draft saved.') } catch (error) { setError(error.message) } finally { setSaving(false) }
  }
  async function submit() {
    if (busy || !editable) return
    setSubmitting(true); setError(''); setSuccess('')
    try {
      const saved = await persist()
      const response = drive?.proposalStatus === 'changes_requested' ? await resubmitMyPlacementDrive(session.accessToken, saved._id) : await submitMyPlacementDrive(session.accessToken, saved._id)
      setDrive(response.data); setForm(formFromDrive(response.data)); setSuccess(drive?.proposalStatus === 'changes_requested' ? 'Placement Drive proposal resubmitted for Admin review.' : 'Placement Drive proposal submitted for Admin review.')
    } catch (error) { setError(error.message) } finally { setSubmitting(false) }
  }
  async function uploadDocument(type, file) {
    if (!file || !drive || !editable) return
    setBusyDocument(`${type}-upload`); setError(''); setSuccess('')
    try {
      const { data } = await uploadMyPlacementDriveDocument(session.accessToken, drive._id, type, file)
      // Keep the local form untouched so an upload cannot erase unsaved proposal edits.
      setDrive(data)
      setSuccess('Proposal PDF uploaded.')
    } catch (error) { setError(error.message) } finally { setBusyDocument('') }
  }
  async function openDocument(type, filename, mode) {
    if (!drive || busyDocument) return
    const viewer = mode === 'view' ? window.open('', '_blank') : null
    if (mode === 'view' && !viewer) { setError('Your browser blocked the document viewer. Allow pop-ups for PlacementHub and try again.'); return }
    if (viewer) viewer.opener = null
    setBusyDocument(`${type}-${mode}`); setError('')
    try {
      const blob = await downloadMyPlacementDriveDocument(session.accessToken, drive._id, type)
      const url = URL.createObjectURL(blob)
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
      if (viewer) viewer.location.href = url
      else { const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename || `${type}.pdf`; anchor.click() }
    } catch (error) { viewer?.close(); setError(error.message) } finally { setBusyDocument('') }
  }
  function addPhase() { setForm(current => current.phases.length >= 5 ? current : { ...current, phases: [...current.phases, { phaseNumber: current.phases.length + 1, title: '', type: 'assessment', description: '' }] }) }
  function removePhase(index) { setForm(current => current.phases.length <= 1 ? current : { ...current, phases: current.phases.filter((_, phaseIndex) => phaseIndex !== index) }) }
  function movePhase(index, direction) { setForm(current => { const target = index + direction; if (target < 0 || target >= current.phases.length) return current; const phases = [...current.phases]; [phases[index], phases[target]] = [phases[target], phases[index]]; return { ...current, phases } }) }

  if (loading) return <LoadingState message="Loading Placement Drive proposal…" />
  if (id && !drive) return <section className="space-y-5"><Link className="text-sm font-bold text-violet-700" to="/company/placement-drives">← Placement Drive proposals</Link><ErrorState message={error || 'Placement Drive proposal could not be loaded.'} /></section>
  const status = drive?.proposalStatus || 'draft'
  const feedback = drive?.review?.requestedChanges || drive?.review?.rejectionReason
  return <section className="space-y-7">
    <Link className="text-sm font-bold text-violet-700" to="/company/placement-drives">← Placement Drive proposals</Link>
    <PageHeader eyebrow="Company" title={drive ? drive.role.title : 'Create Placement Drive proposal'} description="One proposal represents one role. Phase 0 is reserved for the future applicant screening flow and cannot be configured here." action={drive ? <div className="flex gap-2"><StatusBadge status={status} /><StatusBadge status={drive.lifecycleStatus} /></div> : null} />
    {feedback && <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950"><h2 className="font-bold">Admin feedback</h2><p className="mt-2 text-sm leading-6">{feedback}</p></section>}
    {error && <ErrorState message={error} />}
    {success && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{success}</p>}
    {!editable && <p className="rounded-xl border border-slate-200 bg-slate-100 p-4 text-sm text-slate-700">This proposal is {status.replace('_', ' ')} and cannot be edited at this stage.</p>}
    <form className="space-y-6" onSubmit={save}>
      <fieldset disabled={!editable || busy} className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><h2 className="text-lg font-bold">1. Job / Drive details</h2><div className="mt-5 grid gap-4 sm:grid-cols-2"><FormField required label="Role title" value={form.role.title} onChange={event => change('role', 'title', event.target.value)} /><FormField label="Domain" value={form.role.domain} onChange={event => change('role', 'domain', event.target.value)} /><FormField as="select" label="Employment type" value={form.role.employmentType} onChange={event => change('role', 'employmentType', event.target.value)}><option value="full_time">Full time</option><option value="internship">Internship</option><option value="internship_to_full_time">Internship to full time</option></FormField><FormField label="Required skills (comma-separated)" value={form.role.requiredSkills} onChange={event => change('role', 'requiredSkills', event.target.value)} /><FormField as="textarea" className="sm:col-span-2" rows="5" required label="Role description" value={form.role.description} onChange={event => change('role', 'description', event.target.value)} /><FormField as="select" label="Work mode" value={form.driveDetails.workMode} onChange={event => change('driveDetails', 'workMode', event.target.value)}><option value="online">Online</option><option value="offline">Offline</option><option value="hybrid">Hybrid</option></FormField><FormField required label="Work location" value={form.driveDetails.workLocation} onChange={event => change('driveDetails', 'workLocation', event.target.value)} /><FormField required type="number" min="1" step="1" label="Expected hires" value={form.driveDetails.expectedHires} onChange={event => change('driveDetails', 'expectedHires', event.target.value)} /><FormField required type="date" label="Application deadline" value={form.driveDetails.applicationDeadline} onChange={event => change('driveDetails', 'applicationDeadline', event.target.value)} /><FormField type="number" min="0" step="1" label="Compensation amount" hint="Optional; enter 0 only when it is intentionally zero." value={form.driveDetails.compensation.amount} onChange={event => changeCompensation('amount', event.target.value)} /><FormField as="select" label="Compensation period" value={form.driveDetails.compensation.period} onChange={event => changeCompensation('period', event.target.value)}><option value="not_disclosed">Not disclosed</option><option value="per_annum">Per annum</option><option value="per_month">Per month</option><option value="stipend">Stipend</option></FormField><FormField label="Joining period" value={form.driveDetails.joiningPeriod} onChange={event => change('driveDetails', 'joiningPeriod', event.target.value)} /><FormField label="Service bond" value={form.driveDetails.serviceBond} onChange={event => change('driveDetails', 'serviceBond', event.target.value)} /></div></section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><h2 className="text-lg font-bold">2. Eligibility rules</h2><p className="mt-1 text-sm text-slate-600">These rules are defined now and will be evaluated by the backend when Students apply in M6.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><FormField required type="number" min="0" max="10" step="0.01" label="Minimum CGPA" value={form.eligibility.minimumCgpa} onChange={event => change('eligibility', 'minimumCgpa', event.target.value)} /><FormField required type="number" min="0" step="1" label="Maximum active backlogs" value={form.eligibility.maximumActiveBacklogs} onChange={event => change('eligibility', 'maximumActiveBacklogs', event.target.value)} /><BranchSelector branches={branches} selected={form.eligibility.allowedBranches} onToggle={toggleAllowedBranch} /><FormField required className="sm:col-span-2" label="Graduation years (comma-separated)" hint="For example: 2027, 2028" value={form.eligibility.graduationYears} onChange={event => change('eligibility', 'graduationYears', event.target.value)} /><FormField as="textarea" className="sm:col-span-2" rows="3" label="Additional requirements" value={form.eligibility.additionalRequirements} onChange={event => change('eligibility', 'additionalRequirements', event.target.value)} /></div></section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-bold">3. Recruitment phases</h2><p className="mt-1 text-sm text-slate-600">Define 1–5 phases. Phase 0 is reserved for the applicant/screening pool.</p></div><Button variant="secondary" disabled={form.phases.length >= 5} onClick={addPhase}>Add phase</Button></div><div className="mt-5 space-y-4">{form.phases.map((phase, index) => <article key={`${phase.phaseNumber}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold">Phase {index + 1}</h3><div className="flex gap-2"><Button variant="quiet" disabled={index === 0} onClick={() => movePhase(index, -1)}>Move up</Button><Button variant="quiet" disabled={index === form.phases.length - 1} onClick={() => movePhase(index, 1)}>Move down</Button><Button variant="quiet" className="text-rose-700 hover:bg-rose-50" disabled={form.phases.length <= 1} onClick={() => removePhase(index)}>Remove</Button></div></div><div className="mt-4 grid gap-4 sm:grid-cols-2"><FormField required label="Phase title" value={phase.title} onChange={event => changePhase(index, 'title', event.target.value)} /><FormField as="select" label="Phase type" value={phase.type} onChange={event => changePhase(index, 'type', event.target.value)}><option value="assessment">Assessment</option><option value="group_discussion">Group discussion</option><option value="technical_interview">Technical interview</option><option value="hr_interview">HR interview</option><option value="other">Other</option></FormField><FormField as="textarea" className="sm:col-span-2" rows="3" label="Phase description" value={phase.description} onChange={event => changePhase(index, 'description', event.target.value)} /></div></article>)}</div></section>
        <div className="flex flex-wrap gap-3"><Button type="submit">{saving ? 'Saving…' : drive ? 'Save draft' : 'Create draft'}</Button><Button variant="secondary" disabled={!drive || busy} onClick={submit}>{submitting ? 'Submitting…' : status === 'changes_requested' ? 'Resubmit for review' : 'Submit for review'}</Button></div>
      </fieldset>
    </form>
    <ProposalDocuments drive={drive} editable={editable} busy={busy || submitting} busyDocument={busyDocument} onUpload={uploadDocument} onOpen={openDocument} />
  </section>
}

function ProposalDocuments({ drive, editable, busy, busyDocument, onUpload, onOpen }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><h2 className="text-lg font-bold">4. Documents</h2><p className="mt-1 text-sm text-slate-600">Both PDFs are required before submitting for Admin review.</p>{!drive ? <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Save the proposal draft first, then upload the required PDFs.</p> : <div className="mt-4 divide-y divide-slate-100">{documentRows.map(([type, label]) => {
    const file = drive.documents?.[type]
    const typeBusy = busyDocument.startsWith(type)
    return <div key={type} className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><h3 className="font-bold text-slate-900">{label}</h3><p className="mt-1 break-all text-sm text-slate-500">{file?.originalName || 'No PDF uploaded'}</p><p className="mt-1 text-sm text-slate-600" role="status">{typeBusy && busyDocument.endsWith('upload') ? 'Uploading…' : file ? 'Uploaded' : 'Required before submission'}</p></div><div className="flex flex-wrap gap-2">{editable && <label className={`inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 ${busy ? 'cursor-wait opacity-70' : 'cursor-pointer hover:bg-slate-50'}`}><span>{typeBusy && busyDocument.endsWith('upload') ? 'Uploading…' : file ? 'Replace PDF' : 'Upload PDF'}</span><input className="sr-only" type="file" accept="application/pdf,.pdf" disabled={busy} onChange={event => { const selected = event.target.files?.[0]; event.target.value = ''; onUpload(type, selected) }} /></label>}{file && <><Button variant="secondary" disabled={busy} onClick={() => onOpen(type, file.originalName, 'view')}>{typeBusy && busyDocument.endsWith('view') ? 'Opening…' : 'View'}</Button><Button variant="secondary" disabled={busy} onClick={() => onOpen(type, file.originalName, 'download')}>{typeBusy && busyDocument.endsWith('download') ? 'Downloading…' : 'Download'}</Button></>}</div></div>
  })}</div>}</section>
}

function BranchSelector({ branches, selected, onToggle }) {
  return <fieldset className="sm:col-span-2"><legend className="text-sm font-medium text-slate-800">Allowed branches</legend><p className="mt-1.5 text-xs leading-5 text-slate-500">Select one or more branches configured by the Placement Admin.</p>{branches.length ? <><div className="mt-3 flex flex-wrap gap-2">{branches.map(branch => {
    const checked = selected.includes(branch)
    return <label key={branch} className={`cursor-pointer rounded-full border px-3 py-2 text-sm font-semibold transition ${checked ? 'border-violet-700 bg-violet-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-violet-300 hover:bg-violet-50'}`}><input className="sr-only" type="checkbox" checked={checked} onChange={() => onToggle(branch)} /><span>{checked && '✓ '}{branch}</span></label>
  })}</div><p className="mt-3 text-sm text-slate-600">{selected.length ? `${selected.length} branch${selected.length === 1 ? '' : 'es'} selected` : 'Select at least one branch.'}</p></> : <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">No branches are configured by the Placement Admin.</p>}</fieldset>
}
