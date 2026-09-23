import { useEffect, useState } from 'react'
import { ParticipationLetter } from '../features/company/ParticipationLetter.jsx'
import { ErrorState } from '../components/feedback/ErrorState.jsx'
import { LoadingState } from '../components/feedback/LoadingState.jsx'
import { Button } from '../components/ui/Button.jsx'
import { FormField } from '../components/ui/FormField.jsx'
import { PageHeader } from '../components/ui/PageHeader.jsx'
import { StatusBadge } from '../components/ui/StatusBadge.jsx'
import { useAuth } from '../features/auth/useAuth.js'
import { getMyCompany, resubmitMyCompany, updateMyCompany } from '../services/company.service.js'
const blank={companyName:'',website:'',industry:'',location:'',description:'',companyType:'',companySize:'',officialEmail:'',recruiterName:'',recruiterDesignation:'',recruiterEmail:'',recruiterPhone:'',hiringType:'placement',recruitmentTimeline:'',recruitmentMode:'online',expectedHires:'',roleDomains:'',targetBranches:'',workLocations:'',technologies:'',preferredWorkLocations:'',foundedYear:'',linkedinUrl:'',careersUrl:'',productsServices:'',alternateContact:'',representativesCount:'',joiningPeriod:'',selectionProcess:'',roundsCount:''}

const fields = [['companyName','Company name'],['industry','Industry'],['companyType','Company type'],['companySize','Company size'],['location','Headquarters'],['website','Official website'],['officialEmail','Official company email'],['recruiterName','Recruiter name'],['recruiterDesignation','Designation'],['recruiterEmail','Recruiter email'],['recruiterPhone','Phone'],['recruitmentTimeline','Expected timeline'],['expectedHires','Expected hires'],['roleDomains','Roles/domains (comma-separated)'],['targetBranches','Target branches (comma-separated)']]
const listFields = ['roleDomains', 'targetBranches', 'workLocations', 'technologies', 'preferredWorkLocations']

function profileInput(form) {
  const input = Object.fromEntries(Object.keys(blank).map(key => [key, form[key]]))
  for (const key of listFields) input[key] = String(input[key] ?? '').split(',').map(value => value.trim()).filter(Boolean)
  input.expectedHires = Number(input.expectedHires)
  // Empty optional numeric inputs must stay absent rather than coerce to zero.
  for (const key of ['foundedYear', 'representativesCount', 'roundsCount']) {
    if (input[key] === '' || input[key] == null) delete input[key]
  }
  return input
}

export function CompanyProfilePage() {
  const { session } = useAuth()
  const [form, setForm] = useState(blank)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [busyLetter, setBusyLetter] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    let active = true
    getMyCompany(session.accessToken).then(({ data }) => {
      if (active) { setProfile(data); setForm({ ...blank, ...data }) }
    }).catch(error => { if (active) setError(error.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [session.accessToken])

  if (loading) return <LoadingState message="Loading company profile…" />
  if (!profile) return <ErrorState message={error || 'Company profile could not be loaded.'} />

  const busy = saving || submitting || Boolean(busyLetter)
  const complete = profile.isProfileComplete === true
  const rejected = profile.approvalStatus === 'rejected'
  const approved = profile.approvalStatus === 'approved'
  const dirty = JSON.stringify(profileInput(form)) !== JSON.stringify(profileInput({ ...blank, ...profile }))
  const change = (key, value) => setForm(current => ({ ...current, [key]: value }))

  async function save(event) {
    event.preventDefault()
    if (busy) return
    const submit = event.nativeEvent.submitter?.value === 'approval'
    if (submit && (!complete || approved)) return
    setError('')
    setSuccess('')
    setSaving(true)
    setSubmitting(submit)
    try {
      let { data } = await updateMyCompany(session.accessToken, profileInput(form))
      setProfile(data)
      setForm({ ...blank, ...data })
      if (submit) {
        if (!data.isProfileComplete) throw new Error('Complete and save all required profile details and upload a Participation Letter before submitting.')
        if (data.approvalStatus === 'rejected') {
          const response = await resubmitMyCompany(session.accessToken)
          data = response.data
          setProfile(data)
          setForm({ ...blank, ...data })
        }
        setSuccess(data.approvalStatus === 'approved' ? 'Your company profile is already approved.' : 'Your complete company profile is pending Placement Admin approval.')
      } else {
        setSuccess('Company profile saved successfully.')
      }
    } catch (error) {
      setError(error.message)
    } finally {
      setSaving(false)
      setSubmitting(false)
    }
  }

  return <section className="space-y-8">
    <PageHeader eyebrow="Company profile" title="Campus recruitment profile" description="Complete your profile and participation letter for Placement Admin approval." action={<StatusBadge status={profile.approvalStatus} />} />
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-bold">Profile completion & approval</h2>
      <p className="mt-2 font-semibold text-slate-900" role="status">{complete ? 'Profile complete' : 'Profile incomplete'}</p>
      <p className="mt-2 text-sm text-slate-600">{!complete
        ? 'Complete and save all required company, recruiter and hiring details, and upload your Participation Letter.'
        : approved ? 'Your company profile has been approved by the Placement Admin.'
          : rejected ? 'Review the Admin feedback, correct your details or letter, then resubmit for approval.'
            : 'Your complete profile is pending Placement Admin review. Submit for Approval saves your latest details for review.'}</p>
      {dirty && <p className="mt-2 text-sm text-amber-800">You have unsaved changes. Completion reflects your saved profile. Submitting also saves your current details.</p>}
      {rejected && <p className="mt-4 rounded-xl bg-rose-50 p-4 text-rose-800"><strong>Admin feedback:</strong> {profile.rejectionReason || 'No rejection reason was provided.'}</p>}
      {!approved && (complete || rejected) && <Button className="mt-4" type="submit" form="company-profile-form" name="intent" value="approval" disabled={busy || !complete}>
        {submitting ? 'Submitting…' : rejected ? 'Resubmit for Approval' : 'Submit for Approval'}
      </Button>}
    </section>
    {error && <ErrorState message={error} />}
    {success && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-800">{success}</p>}
    <form id="company-profile-form" className="space-y-6" onSubmit={save}>
      <fieldset disabled={busy} className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">Company, recruiter & hiring intent</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {fields.map(([key, label]) => <FormField key={key} label={label} type={key.toLowerCase().includes('email') ? 'email' : key === 'website' ? 'url' : key === 'expectedHires' ? 'number' : 'text'} min={key === 'expectedHires' ? 1 : undefined} step={key === 'expectedHires' ? 1 : undefined} value={form[key] ?? ''} onChange={event => change(key, event.target.value)} required />)}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <FormField as="select" label="Hiring type" value={form.hiringType} onChange={event => change('hiringType', event.target.value)}><option value="placement">Placement</option><option value="internship">Internship</option><option value="both">Both</option></FormField>
            <FormField as="select" label="Recruitment mode" value={form.recruitmentMode} onChange={event => change('recruitmentMode', event.target.value)}><option value="online">Online</option><option value="offline">Offline</option><option value="hybrid">Hybrid</option></FormField>
          </div>
          <div className="mt-4"><FormField as="textarea" rows="5" label="About company" value={form.description || ''} onChange={event => change('description', event.target.value)} required /></div>
        </section>
        <Button type="submit" disabled={busy}>{saving && !submitting ? 'Saving…' : 'Save company profile'}</Button>
      </fieldset>
    </form>
    <ParticipationLetter token={session.accessToken} profile={profile} busy={busyLetter} disabled={saving || submitting} onBusyChange={setBusyLetter} onUploaded={setProfile} onMessage={(type, text) => { setError(type === 'error' ? text : ''); setSuccess(type === 'success' ? text : '') }} />
  </section>
}
