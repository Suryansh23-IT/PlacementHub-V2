import { useEffect, useState } from 'react'
import { Button } from '../components/ui/Button.jsx'
import { PolicyFields } from '../features/policy/PolicyFields.jsx'
import { PageHeader } from '../components/ui/PageHeader.jsx'
import { useAuth } from '../features/auth/useAuth.js'
import { getAdminStudentPolicy, saveAdminStudentPolicy } from '../services/student-policy.service.js'

export function AdminStudentPolicyPage() {
  const { session } = useAuth(); const [form, setForm] = useState(null); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false)
  useEffect(() => { getAdminStudentPolicy(session.accessToken).then(({ data }) => setForm(data)).catch((error) => setMessage(error.message)) }, [session.accessToken])
  if (!form) return <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Loading Student Placement Policy…</p>
  const change = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  async function save(event) { event.preventDefault(); setBusy(true); setMessage(''); try { const { data } = await saveAdminStudentPolicy(session.accessToken, form); setForm(data); setMessage('Student Placement Policy saved.') } catch (error) { setMessage(error.message) } finally { setBusy(false) } }
  return <section className="space-y-6"><PageHeader eyebrow="Placement Admin" title="Student Placement Policy" description="Maintain the single active policy students accept after verification." />{message && <p className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-medium text-violet-900">{message}</p>}<form className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" onSubmit={save}><PolicyFields form={form} onChange={change} /><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save policy'}</Button></form></section>
}
