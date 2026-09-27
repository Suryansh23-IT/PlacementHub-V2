import { useEffect, useState } from 'react'
import { EmptyState } from '../components/feedback/EmptyState.jsx'
import { ErrorState } from '../components/feedback/ErrorState.jsx'
import { LoadingState } from '../components/feedback/LoadingState.jsx'
import { Button } from '../components/ui/Button.jsx'
import { FormField } from '../components/ui/FormField.jsx'
import { PageHeader } from '../components/ui/PageHeader.jsx'
import { StatusBadge } from '../components/ui/StatusBadge.jsx'
import { useAuth } from '../features/auth/useAuth.js'
import { reviewFormSchema, restrictionFormSchema, removalFormSchema } from '../features/discipline/discipline.validation.js'
import { applyAdminRestrictionFromIncident, archiveAdminIncidentReport, listAdminIncidentReports, listAdminPlacementRestrictionHistory, listAdminPlacementRestrictions, removeAdminPlacementRestriction, reviewAdminIncidentReport } from '../services/placement-discipline.service.js'

const titleCase = value => value ? value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase()) : 'Not specified'
const dateLabel = value => value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Not specified'
const blankReview = { action: 'no_action', reviewNote: '', driveCount: '5' }
const blankRestriction = { type: 'temporary_drive_count', reason: '', driveCount: '5' }
const needsReview = incident => incident.reviewStatus === 'pending_review' || (incident.reviewStatus === 'reviewed' && incident.decision === 'refer_to_department')

export function AdminPlacementDisciplinePage() {
  const { session } = useAuth()
  const [incidents, setIncidents] = useState(null)
  const [restrictions, setRestrictions] = useState(null)
  const [restrictionHistory, setRestrictionHistory] = useState(null)
  const [forms, setForms] = useState({})
  const [restrictionForms, setRestrictionForms] = useState({})
  const [removal, setRemoval] = useState({})
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState('')
  const [search, setSearch] = useState('')

  function valid(schema, value) {
    const result = schema.safeParse(value)
    if (!result.success) { setSuccess(''); setError(result.error.issues[0].message) }
    return result.success
  }

  async function reload() {
    const [incidentResponse, restrictionResponse, historyResponse] = await Promise.all([
      listAdminIncidentReports(session.accessToken),
      listAdminPlacementRestrictions(session.accessToken),
      listAdminPlacementRestrictionHistory(session.accessToken),
    ])
    setIncidents(incidentResponse.data)
    setRestrictions(restrictionResponse.data)
    setRestrictionHistory(historyResponse.data)
  }

  useEffect(() => {
    let active = true
    Promise.all([
      listAdminIncidentReports(session.accessToken),
      listAdminPlacementRestrictions(session.accessToken),
      listAdminPlacementRestrictionHistory(session.accessToken),
    ]).then(([incidentResponse, restrictionResponse, historyResponse]) => {
      if (!active) return
      setIncidents(incidentResponse.data)
      setRestrictions(restrictionResponse.data)
      setRestrictionHistory(historyResponse.data)
    }).catch(requestError => { if (active) setError(requestError.message) })
    return () => { active = false }
  }, [session.accessToken])

  const formFor = id => forms[id] || blankReview
  const restrictionFormFor = id => restrictionForms[id] || blankRestriction
  function updateForm(id, field, value) { setForms(current => ({ ...current, [id]: { ...(current[id] || blankReview), [field]: value } })) }
  function updateRestrictionForm(id, field, value) { setRestrictionForms(current => ({ ...current, [id]: { ...(current[id] || blankRestriction), [field]: value } })) }

  async function review(event, incident) {
    event.preventDefault()
    const form = formFor(incident._id)
    if (busy || !valid(reviewFormSchema, form)) return
    setBusy(`review-${incident._id}`); setError(''); setSuccess('')
    try {
      await reviewAdminIncidentReport(session.accessToken, incident._id, { action: form.action, reviewNote: form.reviewNote, ...(form.action === 'temporary_restriction' ? { driveCount: Number(form.driveCount) } : {}) })
      await reload(); setSuccess('Incident review was saved and the required notifications were sent.')
    } catch (requestError) { setError(requestError.message) } finally { setBusy('') }
  }

  async function applyRestriction(event, incident) {
    event.preventDefault()
    const form = restrictionFormFor(incident._id)
    if (busy || !valid(restrictionFormSchema, form)) return
    setBusy(`restriction-${incident._id}`); setError(''); setSuccess('')
    try {
      await applyAdminRestrictionFromIncident(session.accessToken, incident._id, { type: form.type, reason: form.reason, ...(form.type === 'temporary_drive_count' ? { driveCount: Number(form.driveCount) } : {}) })
      await reload(); setRestrictionForms(current => ({ ...current, [incident._id]: blankRestriction })); setSuccess('Placement restriction applied and the Student was notified.')
    } catch (requestError) { setError(requestError.message) } finally { setBusy('') }
  }

  async function removeRestriction(event, restriction) {
    event.preventDefault()
    if (busy || !valid(removalFormSchema, removal[restriction._id] || '')) return
    setBusy(`remove-${restriction._id}`); setError(''); setSuccess('')
    try {
      await removeAdminPlacementRestriction(session.accessToken, restriction._id, { removalReason: removal[restriction._id] || '' })
      await reload(); setSuccess('Restriction removed and moved to history. Normal drive eligibility rules still apply. Close the related matter separately when your review is complete.')
    } catch (requestError) { setError(requestError.message) } finally { setBusy('') }
  }

  async function archiveMatter(incident) {
    if (busy) return
    setBusy(`archive-${incident._id}`); setError(''); setSuccess('')
    try {
      await archiveAdminIncidentReport(session.accessToken, incident._id)
      await reload(); setSuccess('Resolved matter closed. Its full history remains available below.')
    } catch (requestError) { setError(requestError.message) } finally { setBusy('') }
  }

  if (error && !incidents) return <ErrorState message={error} />
  if (!incidents || !restrictions || !restrictionHistory) return <LoadingState message="Loading placement discipline reviews…" />
  const pendingIncidents = incidents.filter(needsReview)
  const pastIncidents = incidents.filter(incident => !needsReview(incident))
  const activeRestrictionStudentIds = new Set(restrictions.map(restriction => String(restriction.studentId)).filter(Boolean))
  const attentionCount = pendingIncidents.length + restrictions.length
  const matches = record => !search.trim() || [record.student?.name, record.student?.rollNumber, record.student?.branch, record.company?.companyName, record.drive?.role?.title].some(value => String(value || '').toLowerCase().includes(search.trim().toLowerCase()))
  const visiblePending = pendingIncidents.filter(matches)
  const visibleRestrictions = restrictions.filter(matches)
  const visiblePast = pastIncidents.filter(matches)
  const visibleHistory = restrictionHistory.filter(matches)

  return <section className="space-y-8">
    <PageHeader eyebrow="Career Development Centre" title="Placement Discipline & Restrictions" description="Review current matters, manage active eligibility actions, and retain the complete record." action={<StatusBadge status={attentionCount ? 'warning' : 'neutral'}>{attentionCount} requiring attention</StatusBadge>} />
    {success && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{success}</p>}
    {error && <ErrorState message={error} />}
    <nav aria-label="Discipline sections" className="flex flex-wrap gap-3 text-sm font-semibold text-violet-700"><a href="#discipline-pending">Pending reviews ({pendingIncidents.length})</a><a href="#discipline-restrictions">Active restrictions ({restrictions.length})</a><a href="#discipline-history">History ({pastIncidents.length + restrictionHistory.length})</a></nav>
    <FormField label="Find a student or matter" type="search" placeholder="Student name, enrollment, branch, company or role" value={search} onChange={event => setSearch(event.target.value)} />
    {search && <Button variant="secondary" onClick={() => setSearch('')}>Clear search</Button>}
    <fieldset disabled={Boolean(busy)} aria-busy={Boolean(busy)} className="min-w-0 space-y-8">

    <section className="space-y-4">
      <div id="discipline-pending"><SectionHeading title="Pending reviews" description="Forgive or warn to resolve this review. A department referral remains pending until a final decision. Forgiving this incident does not remove an existing restriction." /></div>
      {visiblePending.length ? visiblePending.map(incident => <IncidentCard key={incident._id} incident={incident} form={formFor(incident._id)} updateForm={updateForm} busy={busy === `review-${incident._id}`} onSubmit={review} />) : <EmptyState title={search ? "No matching pending reviews" : "No pending incidents"} description="Pending Company reports matching your search appear here." />}
      <div id="discipline-restrictions" className="pt-2"><h3 className="font-semibold text-slate-900">Active placement restrictions</h3><p className="mt-1 text-sm text-slate-600">Removing a restriction restores normal eligibility checks and keeps the historical record.</p></div>
      {visibleRestrictions.length ? <div className="grid gap-4 lg:grid-cols-2">{visibleRestrictions.map(restriction => <ActiveRestrictionCard key={restriction._id} restriction={restriction} value={removal[restriction._id] || ''} onChange={value => setRemoval(current => ({ ...current, [restriction._id]: value }))} busy={busy === `remove-${restriction._id}`} onSubmit={removeRestriction} />)}</div> : <EmptyState title={search ? "No matching active restrictions" : "No active restrictions"} description="Active eligibility restrictions matching your search appear here." />}
    </section>

    <section id="discipline-history" className="space-y-4 border-t border-slate-200 pt-8">
      <SectionHeading title="History / Closed matters" description="Resolved decisions and inactive restrictions remain available as the discipline history." />
      {!visiblePast.length && !visibleHistory.length ? <EmptyState title={search ? "No matching history" : "No past discipline history"} description="Resolved incident and restriction records will appear here." /> : <>
        {visiblePast.length > 0 && <div className="space-y-3">{visiblePast.map(incident => <details key={incident._id} className="rounded-2xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer font-semibold text-slate-900">{incident.student?.name || 'Student'} · {incident.student?.rollNumber || 'No enrollment'} · {titleCase(incident.decision)} · {incident.archivedAt ? 'Matter closed' : 'Review resolved'}</summary><ClosedIncidentCard incident={incident} restrictionForm={restrictionFormFor(incident._id)} updateRestrictionForm={updateRestrictionForm} restrictionBusy={busy === `restriction-${incident._id}`} onApplyRestriction={applyRestriction} hasActiveRestriction={activeRestrictionStudentIds.has(String(incident.studentId))} archiveBusy={busy === `archive-${incident._id}`} onArchive={archiveMatter} /></details>)}</div>}
        {visibleHistory.length > 0 && <div className="pt-3"><h3 className="font-semibold text-slate-900">Restriction history</h3><div className="mt-3 grid gap-3 lg:grid-cols-2">{visibleHistory.map(restriction => <HistoricalRestrictionCard key={restriction._id} restriction={restriction} />)}</div></div>}
      </>}
    </section>
    </fieldset>
  </section>
}

function SectionHeading({ title, description }) {
  return <div><h2 className="text-lg font-bold text-slate-950">{title}</h2><p className="mt-1 text-sm text-slate-600">{description}</p></div>
}

function IncidentDetails({ incident }) {
  return <><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-slate-950">{incident.student?.name || 'Student'} <span className="font-medium text-slate-500">· {incident.company?.companyName || 'Company'}</span></h3><StatusBadge status={needsReview(incident) ? 'warning' : 'neutral'}>{titleCase(incident.reviewStatus)}</StatusBadge>{incident.archivedAt && <StatusBadge status="neutral">Matter closed</StatusBadge>}</div><p className="mt-2 text-sm text-slate-700"><strong>{titleCase(incident.category)}:</strong> {incident.description}</p>{incident.note && <p className="mt-2 text-sm text-slate-600">{incident.note}</p>}<p className="mt-3 text-xs text-slate-500">{incident.student?.rollNumber || 'Enrollment not available'} · {incident.student?.branch || 'Branch not available'} · Phase {incident.phase} · Reported {dateLabel(incident.createdAt)}</p></div><StatusBadge status="neutral">{incident.drive?.role?.title || 'Placement Drive'}</StatusBadge></div>{incident.reviewNote && <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700"><strong>Admin decision:</strong> {incident.reviewNote} <span className="text-slate-500">({titleCase(incident.decision)}) · {dateLabel(incident.reviewedAt)}</span></div>}</>
}

function IncidentCard({ incident, form, updateForm, busy, onSubmit }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><IncidentDetails incident={incident} /><form className="mt-5 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2" onSubmit={event => onSubmit(event, incident)}><FormField as="select" label="Placement action" value={form.action} onChange={event => updateForm(incident._id, 'action', event.target.value)}><option value="no_action">No action / forgive</option><option value="warning_only">Warning only</option><option value="temporary_restriction">Temporary placement restriction</option><option value="permanent_restriction">Permanent placement restriction</option><option value="refer_to_department">Refer to department</option></FormField>{form.action === 'temporary_restriction' && <FormField required type="number" min="1" max="100" label="Future Placement Drives" value={form.driveCount} onChange={event => updateForm(incident._id, 'driveCount', event.target.value)} />}<FormField required as="textarea" className="sm:col-span-2" rows="3" minLength={2} maxLength={form.action.endsWith("_restriction") ? 500 : 1500} label="Admin reason / note" hint={form.action.endsWith("_restriction") ? "Up to 500 characters. A new restriction replaces any active restriction for this student." : "Up to 1500 characters. Explain the decision for the retained record."} value={form.reviewNote} onChange={event => updateForm(incident._id, 'reviewNote', event.target.value)} /><div className="sm:col-span-2"><Button type="submit" disabled={busy}>{busy ? 'Saving…' : form.action === 'refer_to_department' ? 'Refer to department' : 'Save decision'}</Button></div></form></article>
}

function ClosedIncidentCard({ incident, restrictionForm, updateRestrictionForm, restrictionBusy, onApplyRestriction, hasActiveRestriction, archiveBusy, onArchive }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><IncidentDetails incident={incident} /><div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">{incident.archivedAt ? <p className="text-sm text-slate-600">Matter closed {dateLabel(incident.archivedAt)}.</p> : <><Button variant="secondary" disabled={hasActiveRestriction || archiveBusy} onClick={() => onArchive(incident)}>{archiveBusy ? 'Closing…' : 'Forget / Close Matter'}</Button>{hasActiveRestriction && <p className="text-sm text-amber-800">Remove the active restriction before closing this matter.</p>}</>}</div>{!incident.archivedAt && <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold text-violet-700">Apply or replace a restriction</summary><p className="mt-2 text-sm text-amber-800">This replaces any active restriction for this student. The previous restriction remains in history.</p><form className="mt-5 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2" onSubmit={event => onApplyRestriction(event, incident)}><div className="sm:col-span-2"><h4 className="font-semibold text-slate-900">Apply restriction</h4><p className="mt-1 text-sm text-slate-600">Create a later, separate eligibility action from this historical incident. Its earlier decision remains unchanged.</p></div><FormField as="select" label="Restriction type" value={restrictionForm.type} onChange={event => updateRestrictionForm(incident._id, 'type', event.target.value)}><option value="temporary_drive_count">Temporary restriction</option><option value="permanent">Permanent restriction</option></FormField>{restrictionForm.type === 'temporary_drive_count' && <FormField required type="number" min="1" max="100" label="Future Placement Drives" value={restrictionForm.driveCount} onChange={event => updateRestrictionForm(incident._id, 'driveCount', event.target.value)} />}<FormField required as="textarea" className="sm:col-span-2" rows="3" minLength={2} maxLength={500} label="Restriction reason" value={restrictionForm.reason} onChange={event => updateRestrictionForm(incident._id, 'reason', event.target.value)} /><div className="sm:col-span-2"><Button type="submit" disabled={restrictionBusy}>{restrictionBusy ? 'Applying…' : 'Apply restriction'}</Button></div></form></details>}</article>
}

function restrictionLabel(restriction) { return restriction.type === 'permanent' ? 'Permanent restriction' : `${restriction.remainingDriveCount ?? 0} drive${restriction.remainingDriveCount === 1 ? '' : 's'} remaining` }

function ActiveRestrictionCard({ restriction, value, onChange, busy, onSubmit }) {
  return <article className="rounded-2xl border border-rose-200 bg-rose-50 p-5"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-rose-950">{restriction.student?.name || 'Student'}</h3><StatusBadge status="error">{restrictionLabel(restriction)}</StatusBadge></div><p className="mt-2 text-sm text-rose-900">{restriction.reason}</p><p className="mt-2 text-xs text-rose-800">{restriction.student?.rollNumber || 'Enrollment not available'} · {restriction.student?.branch || 'Branch not available'} · imposed {dateLabel(restriction.imposedAt)}</p><form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={event => onSubmit(event, restriction)}><FormField required className="flex-1" minLength={2} maxLength={1000} label="Reason for removal" value={value} onChange={event => onChange(event.target.value)} /><Button type="submit" variant="secondary" disabled={busy}>{busy ? 'Removing…' : 'Remove restriction'}</Button></form></article>
}

function HistoricalRestrictionCard({ restriction }) {
  const outcome = restriction.inactiveReason === 'superseded' ? 'Superseded by later action' : restriction.inactiveReason === 'removed_by_admin' ? 'Removed / eligibility restored' : 'Completed or inactive'
  return <article className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex flex-wrap items-center gap-2"><h4 className="font-semibold text-slate-900">{restriction.student?.name || 'Student'}</h4><StatusBadge status="neutral">{outcome}</StatusBadge></div><p className="mt-2 text-sm text-slate-700">{restriction.type === 'permanent' ? 'Permanent restriction' : `${restriction.initialDriveCount ?? restriction.remainingDriveCount ?? 0} drive temporary restriction`} · {restriction.reason}</p><p className="mt-2 text-xs text-slate-500">Imposed {dateLabel(restriction.imposedAt)}{restriction.removedAt ? ` · Resolved ${dateLabel(restriction.removedAt)}` : ''}</p>{restriction.removalReason && <p className="mt-2 text-xs text-slate-600">Removal note: {restriction.removalReason}</p>}</article>
}
