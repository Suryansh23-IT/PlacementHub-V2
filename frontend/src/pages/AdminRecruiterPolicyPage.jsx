import { useEffect, useState } from 'react'
import { Button } from '../components/ui/Button.jsx'
import { FormField } from '../components/ui/FormField.jsx'
import { PageHeader } from '../components/ui/PageHeader.jsx'
import { ErrorState } from '../components/feedback/ErrorState.jsx'
import { LoadingState } from '../components/feedback/LoadingState.jsx'
import { PolicyFields } from '../features/policy/PolicyFields.jsx'
import { recruiterPolicySchema } from '../features/policy/recruiter-policy.schema.js'
import { useAuth } from '../features/auth/useAuth.js'
import { getAdminRecruiterPolicies, saveAdminRecruiterPolicy } from '../services/recruiter-policy.service.js'

const blank = { title: 'Recruiter Placement Policy', academicYear: '', version: '', policyText: '', active: false }
export function AdminRecruiterPolicyPage() {
  const { session } = useAuth()
  const [policies, setPolicies] = useState(null)
  const [form, setForm] = useState(blank)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    getAdminRecruiterPolicies(session.accessToken).then(({ data }) => {
      if (active) { setPolicies(data); setForm(data.find(policy => policy.active) || data[0] || blank) }
    }).catch(error => { if (active) setError(error.message) })
    return () => { active = false }
  }, [session.accessToken])

  async function save(event) {
    event.preventDefault()
    if (busy) return
    setError(''); setSuccess('')
    const parsed = recruiterPolicySchema.safeParse(form)
    if (!parsed.success) { setError(parsed.error.issues.map(issue => issue.message).join(' ')); return }
    setBusy(true)
    try {
      const { data } = await saveAdminRecruiterPolicy(session.accessToken, { ...parsed.data, ...(form._id ? { id: form._id } : {}) })
      setForm(data)
      const response = await getAdminRecruiterPolicies(session.accessToken)
      setPolicies(response.data)
      setSuccess('Recruiter Placement Policy saved.')
    } catch (error) { setError(error.message) } finally { setBusy(false) }
  }

  if (!policies) return error ? <ErrorState message={error} /> : <LoadingState message="Loading Recruiter Placement Policy…" />
  return <section className="space-y-6">
    <PageHeader eyebrow="Placement Admin" title="Recruiter Placement Policy" description="Maintain policy versions for approved Companies. Only one version can be active at a time." />
    {error && <ErrorState message={error} />}
    {success && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{success}</p>}
    {!policies.length && <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">No Recruiter policy text has been supplied. Insert the approved policy text below, then save and activate it.</p>}
    {policies.length > 0 && !policies.some(policy => policy.active) && <p className="text-sm text-amber-800">No active policy. Companies cannot sign until you activate a version.</p>}
    <div className="flex flex-wrap items-end gap-4">
      <FormField as="select" label="Policy version" value={form._id || ''} disabled={busy} onChange={event => { setForm(policies.find(policy => policy._id === event.target.value) || blank); setError(''); setSuccess('') }}>
        <option value="">New version</option>{policies.map(policy => <option key={policy._id} value={policy._id}>{policy.academicYear} · {policy.version} · {policy.active ? 'Active' : 'Inactive'}</option>)}
      </FormField>
      <Button variant="secondary" disabled={busy} onClick={() => { setForm({ ...blank, title: form.title, academicYear: form.academicYear, policyText: form.policyText }); setError(''); setSuccess('') }}>Create new version</Button>
    </div>
    <form className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" onSubmit={save}>
      <fieldset disabled={busy} className="space-y-5">
        {form._id && <p className="text-sm text-slate-600">Saved text and version details are preserved for signed agreements. Create a new version to revise them; you can activate or deactivate this version below.</p>}
        <PolicyFields form={form} readOnly={Boolean(form._id)} onChange={(key, value) => setForm(current => ({ ...current, [key]: value }))} />
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save policy'}</Button>
      </fieldset>
    </form>
  </section>
}
