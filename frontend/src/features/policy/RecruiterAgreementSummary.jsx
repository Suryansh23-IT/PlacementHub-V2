import { useEffect, useState } from 'react'
import { getRecruiterAgreement } from '../../services/recruiter-policy.service.js'

export function RecruiterAgreementSummary({ token, companyId }) {
  const [agreement, setAgreement] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    getRecruiterAgreement(token, companyId).then(({ data }) => { if (active) setAgreement(data) }).catch(error => { if (active) setError(error.message) })
    return () => { active = false }
  }, [token, companyId])
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <h2 className="font-bold">Recruiter Placement Agreement</h2>
    {error ? <p className="mt-3 text-sm text-rose-800" role="alert">{error}</p> : !agreement ? <p className="mt-3 text-sm text-slate-500">Loading agreement status…</p> : <>
      {!agreement.title && <p className="mt-3 text-sm text-slate-500">No active Recruiter policy.</p>}
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">{[
        ['Status', agreement.status === 'accepted' ? 'Accepted' : 'Not Accepted'], ['Policy title', agreement.title], ['Academic year', agreement.academicYear], ['Version', agreement.version], ['Accepted at', agreement.acceptedAt ? new Date(agreement.acceptedAt).toLocaleString() : null],
      ].map(([label, value]) => <div key={label}><dt className="text-xs font-bold text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm text-slate-800">{value ?? '—'}</dd></div>)}</dl>
    </>}
  </section>
}
