import { useEffect, useState } from 'react'
import { Button } from '../components/ui/Button.jsx'
import { ErrorState } from '../components/feedback/ErrorState.jsx'
import { LoadingState } from '../components/feedback/LoadingState.jsx'
import { PageHeader } from '../components/ui/PageHeader.jsx'
import { useAuth } from '../features/auth/useAuth.js'
import { acceptMyRecruiterPolicy, getMyRecruiterPolicy } from '../services/recruiter-policy.service.js'

export function RecruiterPolicyPage() {
  const { session } = useAuth()
  const [data, setData] = useState(null)
  const [agreed, setAgreed] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    getMyRecruiterPolicy(session.accessToken).then(({ data }) => { if (active) setData(data) }).catch(error => { if (active) setError(error.message) })
    return () => { active = false }
  }, [session.accessToken])
  async function accept() {
    if (!agreed || busy || !data?.policy || data.acceptance) return
    setBusy(true); setError('')
    try {
      const { data: result } = await acceptMyRecruiterPolicy(session.accessToken, data.policy)
      setData(result)
    } catch (error) {
      setError(error.message)
      setAgreed(false)
      // Refresh stale versions; the Company must explicitly agree to the new text.
      try { const response = await getMyRecruiterPolicy(session.accessToken); setData(response.data) } catch { setData(null) }
    } finally { setBusy(false) }
  }
  if (error && !data) return <ErrorState message={error} />
  if (!data) return <LoadingState message="Loading Recruiter Placement Policy…" />
  const { policy, acceptance } = data
  if (!policy) return <section className="space-y-6"><PageHeader eyebrow="Placement agreement" title="Recruiter Placement Policy" description="No active policy is available yet." /><p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">The Placement Admin needs to provide and activate the Recruiter Placement Policy before you can sign.</p></section>
  return <section className="space-y-6">
    <PageHeader eyebrow="Placement agreement" title={policy.title} description={`${policy.academicYear} · Version ${policy.version}`} />
    {error && <ErrorState message={error} />}
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"><div className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">{policy.policyText}</div></article>
    {acceptance ? <section role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900"><h2 className="font-bold">Recruiter Placement Agreement Accepted</h2><p className="mt-2 text-sm">{policy.academicYear} · Version {acceptance.policyVersion} · Accepted on {new Date(acceptance.acceptedAt).toLocaleString()}</p></section> : <section className="rounded-2xl border border-violet-200 bg-violet-50 p-5">
      <label className="flex gap-3 text-sm leading-6 text-slate-800"><input className="mt-1 h-4 w-4 shrink-0" type="checkbox" checked={agreed} disabled={busy} onChange={event => setAgreed(event.target.checked)} />I confirm that I am authorized to represent the organization, have read and understood the Recruiter Placement Policy, and agree to comply with it on behalf of the organization.</label>
      <Button className="mt-5" disabled={!agreed || busy} onClick={accept}>{busy ? 'Accepting…' : 'Accept & Sign Agreement'}</Button>
    </section>}
  </section>
}
