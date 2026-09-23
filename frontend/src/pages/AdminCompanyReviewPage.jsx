import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { ErrorState } from '../components/feedback/ErrorState.jsx'
import { LoadingState } from '../components/feedback/LoadingState.jsx'
import { Button } from '../components/ui/Button.jsx'
import { FormField } from '../components/ui/FormField.jsx'
import { PageHeader } from '../components/ui/PageHeader.jsx'
import { StatusBadge } from '../components/ui/StatusBadge.jsx'
import { useAuth } from '../features/auth/useAuth.js'
import { RecruiterAgreementSummary } from '../features/policy/RecruiterAgreementSummary.jsx'
import { downloadAdminParticipationLetter, getCompanies, reviewCompany } from '../services/company.service.js'

const rejectionSchema = z.string().trim().min(2, 'Provide a rejection reason of at least 2 characters.').max(500, 'Use at most 500 characters.')
const list = value => value?.length ? value.join(', ') : null
const titleCase = value => value ? value[0].toUpperCase() + value.slice(1) : null

export function AdminCompanyReviewPage() {
  const { id } = useParams()
  const { session } = useAuth()
  return <CompanyReviewRecord key={`${id}:${session.accessToken}`} id={id} session={session} />
}

function CompanyReviewRecord({ id, session }) {
  const [search] = useSearchParams()
  const [record, setRecord] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState('')
  const [decision, setDecision] = useState('')
  const [documentError, setDocumentError] = useState('')
  const [busyDocument, setBusyDocument] = useState('')
  const filter = ['pending', 'approved', 'rejected', 'all'].includes(search.get('status')) ? search.get('status') : 'pending'

  useEffect(() => {
    let active = true
    getCompanies(session.accessToken).then(({ data }) => {
      if (!active) return
      const company = data.find(item => item._id === id)
      if (!company) throw new Error('Company account was not found.')
      setRecord(company)
    }).catch(error => { if (active) setError(error.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [id, session.accessToken])

  async function decide(status) {
    if (decision || !record.isProfileComplete || record.company?.approvalStatus !== 'pending') return
    const result = rejectionSchema.safeParse(reason)
    if (status === 'rejected' && !result.success) {
      setReasonError(result.error.issues[0].message)
      return
    }
    setDecision(status)
    setError('')
    setSuccess('')
    setReasonError('')
    try {
      const { data } = await reviewCompany(session.accessToken, id, { status, ...(status === 'rejected' ? { rejectionReason: result.data } : {}) })
      setRecord(current => ({ ...current, company: data }))
      setReason('')
      setSuccess(`Company ${status} successfully.`)
    } catch (error) { setError(error.message) } finally { setDecision('') }
  }

  async function openLetter(mode) {
    if (busyDocument) return
    setDocumentError('')
    const viewer = mode === 'view' ? window.open('', '_blank') : null
    if (mode === 'view' && !viewer) {
      setDocumentError('Your browser blocked the document viewer. Allow pop-ups for PlacementHub and try again.')
      return
    }
    if (viewer) viewer.opener = null
    setBusyDocument(mode)
    try {
      const blob = await downloadAdminParticipationLetter(session.accessToken, id)
      const url = URL.createObjectURL(blob)
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
      if (viewer) viewer.location.href = url
      else {
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = record.company.participationLetter.originalName || 'participation-letter.pdf'
        anchor.click()
      }
    } catch (error) { viewer?.close(); setDocumentError(error.message) } finally { setBusyDocument('') }
  }

  const back = <Link className="text-sm font-bold text-violet-700" to={`/admin/companies?status=${filter}`}>← Company list</Link>
  if (loading) return <LoadingState message="Loading company record…" />
  if (!record) return <section className="space-y-6">{back}<ErrorState message={error || 'Company record could not be loaded.'} /></section>
  const profile = record.company || {}
  const file = profile.participationLetter
  const canReview = profile.approvalStatus === 'pending' && record.isProfileComplete
  return <section className="space-y-6">
    {back}
    <PageHeader eyebrow="Company review" title={profile.companyName || record.name} description={profile.industry || 'Industry not provided'} action={<StatusBadge status={profile.approvalStatus || 'pending'} />} />
    <RecruiterAgreementSummary token={session.accessToken} companyId={id} />
    <Record title="Company details" items={[
      ['Company name', profile.companyName], ['Industry', profile.industry], ['Company type', profile.companyType], ['Company size', profile.companySize], ['Headquarters', profile.location],
      ['Website', <SafeLink key="website" url={profile.website} />], ['Official email', profile.officialEmail], ['About', profile.description], ['Work locations', list(profile.workLocations)],
      ['LinkedIn', <SafeLink key="linkedin" url={profile.linkedinUrl} />], ['Careers', <SafeLink key="careers" url={profile.careersUrl} />], ['Technologies', list(profile.technologies)], ['Domains', list(profile.roleDomains)], ['Products / services', profile.productsServices], ['Founded year', profile.foundedYear],
    ]} />
    <Record title="Recruiter / SPOC" items={[
      ['Name', profile.recruiterName], ['Designation', profile.recruiterDesignation], ['Official email', profile.recruiterEmail], ['Phone', profile.recruiterPhone], ['Alternate contact', profile.alternateContact],
    ]} />
    <Record title="Campus hiring intent" items={[
      ['Hiring type', titleCase(profile.hiringType)], ['Expected timeline', profile.recruitmentTimeline], ['Recruitment mode', titleCase(profile.recruitmentMode)], ['Approximate hiring count', profile.expectedHires],
      ['Broad roles / domains', list(profile.roleDomains)], ['Target branches', list(profile.targetBranches)], ['Visiting representatives', profile.representativesCount], ['Preferred locations', list(profile.preferredWorkLocations)], ['Joining period', profile.joiningPeriod], ['Selection process', profile.selectionProcess], ['Number of rounds', profile.roundsCount],
    ]} />
    <Record title="Participation Letter" items={[
      ['Status', file?.originalName ? 'Uploaded' : 'Not uploaded (required)'],
      ['Filename', file?.originalName],
      ...(file?.originalName ? [['Document', <div key="letter" className="flex flex-wrap gap-2"><Button variant="secondary" disabled={Boolean(busyDocument)} onClick={() => openLetter('view')}>{busyDocument === 'view' ? 'Opening…' : 'View'}</Button><Button variant="secondary" disabled={Boolean(busyDocument)} onClick={() => openLetter('download')}>{busyDocument === 'download' ? 'Downloading…' : 'Download'}</Button></div>]] : []),
    ]} />
    {documentError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{documentError}</p>}
    <Record title="Approval" items={[
      ['Profile completion', record.isProfileComplete ? 'Complete' : 'Incomplete'], ['Current status', titleCase(profile.approvalStatus || 'pending')],
      ...(profile.approvalStatus === 'rejected' ? [['Rejection reason', profile.rejectionReason]] : []),
    ]} />
    {error && <ErrorState message={error} />}
    {success && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{success}</p>}
    {profile.approvalStatus === 'pending' && <section className="rounded-2xl border border-violet-200 bg-violet-50 p-5">
      <h2 className="font-bold">Review decision</h2>
      {!canReview && <p className="mt-3 text-sm text-amber-800">The company must complete its profile and Participation Letter before it can be approved or rejected.</p>}
      <div className="mt-4"><FormField as="textarea" rows="3" label="Rejection reason (required to reject)" hint="2–500 characters. Not required for approval." maxLength={500} value={reason} error={reasonError} disabled={!canReview || Boolean(decision)} onChange={event => { setReason(event.target.value); setReasonError('') }} /></div>
      <div className="mt-4 flex flex-wrap gap-3"><Button disabled={!canReview || Boolean(decision)} onClick={() => decide('approved')}>{decision === 'approved' ? 'Approving…' : 'Approve'}</Button><Button variant="danger" disabled={!canReview || Boolean(decision)} onClick={() => decide('rejected')}>{decision === 'rejected' ? 'Rejecting…' : 'Reject'}</Button></div>
    </section>}
  </section>
}

function SafeLink({ url }) {
  if (!url) return 'Not provided'
  let safe = false
  try { safe = ['http:', 'https:'].includes(new URL(url).protocol) } catch { /* Display invalid URLs as text. */ }
  return safe ? <a className="font-semibold text-violet-700 hover:underline" href={url} target="_blank" rel="noreferrer noopener">{url}</a> : <span>{url}</span>
}

function Record({ title, items }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold">{title}</h2><dl className="mt-3 grid gap-3 sm:grid-cols-2">{items.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs font-bold text-slate-500">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">{value === '' || value == null ? 'Not provided' : value}</dd></div>)}</dl></section>
}
