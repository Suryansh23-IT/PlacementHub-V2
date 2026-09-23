import { useEffect, useState } from 'react'
import { Button } from '../components/ui/Button.jsx'
import { ErrorState } from '../components/feedback/ErrorState.jsx'
import { LoadingState } from '../components/feedback/LoadingState.jsx'
import { PageHeader } from '../components/ui/PageHeader.jsx'
import { useAuth } from '../features/auth/useAuth.js'
import { acceptMyStudentPolicy, getMyStudentPolicy } from '../services/student-policy.service.js'

export function StudentPolicyPage() {
  const { session } = useAuth(); const [data, setData] = useState(null); const [agreed, setAgreed] = useState(false); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  useEffect(() => { getMyStudentPolicy(session.accessToken).then(({ data: result }) => setData(result)).catch((e) => setError(e.message)) }, [session.accessToken])
  async function accept() { setBusy(true); setError(''); try { const { data: result } = await acceptMyStudentPolicy(session.accessToken); setData(result) } catch (e) { setError(e.message) } finally { setBusy(false) } }
  if (error && !data) return <ErrorState message={error} />; if (!data) return <LoadingState message="Loading Student Placement Policy…" />
  const { policy, acceptance } = data
  return <section className="space-y-6"><PageHeader eyebrow="Placement agreement" title={policy.title} description={`${policy.academicYear} · Version ${policy.version}`} />{error && <ErrorState message={error} />}<article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"><div className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{policy.policyText}</div></article>{acceptance ? <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900"><h2 className="font-bold">Placement Agreement Accepted</h2><p className="mt-2 text-sm">{policy.academicYear} · Version {acceptance.policyVersion} · Accepted on {new Date(acceptance.acceptedAt).toLocaleString()}</p></section> : <section className="rounded-2xl border border-violet-200 bg-violet-50 p-5"><label className="flex gap-3 text-sm leading-6 text-slate-800"><input className="mt-1 h-4 w-4" type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />I have read and understood the Student Placement Policy and agree to comply with it.</label><Button className="mt-5" disabled={!agreed || busy} onClick={accept}>{busy ? 'Accepting…' : 'Accept & Sign Agreement'}</Button></section>}</section>
}
