import { useState } from 'react'
import { Button } from '../ui/Button.jsx'
import { FormField } from '../ui/FormField.jsx'

export function DriveMessageComposer({ driveName, actions }) {
  const [selected, setSelected] = useState('')
  const [form, setForm] = useState({ title: '', message: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const action = actions.find(item => item.id === selected)

  function choose(id) { setSelected(id); setForm({ title: '', message: '' }); setError(''); setSuccess('') }
  async function submit(event) {
    event.preventDefault()
    if (!action || busy) return
    setBusy(true); setError(''); setSuccess('')
    try { const result = await action.send(form); setForm({ title: '', message: '' }); setSuccess(action.success?.(result) || 'Notification sent.') } catch (error) { setError(error.message) } finally { setBusy(false) }
  }

  return <section className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50/60 p-5 shadow-sm shadow-violet-100/60"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-extrabold tracking-tight text-violet-950">Drive communication</h2><p className="mt-1 text-sm text-violet-900">Context: <strong>{driveName || 'Placement Drive'}</strong></p></div><div className="flex flex-wrap gap-2 sm:justify-end">{actions.map(item => <Button key={item.id} type="button" variant={selected === item.id ? 'primary' : 'secondary'} onClick={() => choose(item.id)}>{item.label}</Button>)}</div></div>{action && <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={submit}><div className="sm:col-span-2"><p className="text-sm text-violet-900">{action.description}</p></div><FormField required label="Title" value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} /><div className="hidden sm:block" /><FormField required as="textarea" className="sm:col-span-2" rows="3" label="Message" maxLength={1500} value={form.message} onChange={event => setForm(current => ({ ...current, message: event.target.value }))} /><div className="sm:col-span-2 flex flex-wrap items-center gap-3"><Button type="submit" disabled={busy}>{busy ? 'Sending…' : action.label}</Button>{success && <p role="status" className="text-sm font-semibold text-emerald-800">{success}</p>}</div></form>}{error && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}</section>
}
