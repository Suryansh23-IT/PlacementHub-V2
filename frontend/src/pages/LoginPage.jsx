import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ErrorState } from '../components/feedback/ErrorState.jsx'
import { useAuth } from '../features/auth/useAuth.js'
import { loginFormSchema } from '../features/auth/auth.schemas.js'
import { loginAccount } from '../services/auth.service.js'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { startSession } = useAuth()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    const validation = loginFormSchema.safeParse(form)
    if (!validation.success) return setError(validation.error.issues[0].message)

    setIsSubmitting(true)
    try {
      const { data } = await loginAccount(validation.data)
      startSession(data)
      navigate(location.state?.from ?? '/dashboard', { replace: true })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthCard title="Welcome back" description="Sign in to continue to PlacementHub.">
      {error && <ErrorState message={error} />}
      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <AuthField label="Email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
        <AuthField label="Password" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
        <button className="w-full rounded-lg bg-violet-700 px-4 py-2.5 font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-violet-400" disabled={isSubmitting}>{isSubmitting ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <p className="mt-5 text-sm text-slate-600">New here? <Link className="font-semibold text-violet-700" to="/register">Create an account</Link>.</p>
    </AuthCard>
  )
}

export function AuthCard({ title, description, children }) {
  return <section className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-sm"><h1 className="text-2xl font-bold text-slate-950">{title}</h1><p className="mt-2 text-slate-600">{description}</p>{children}</section>
}

export function AuthField({ label, type, value, onChange, autoComplete, placeholder }) {
  return <label className="block text-sm font-medium text-slate-700">{label}<input className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-950 outline-none focus:border-violet-600 focus:ring-2 focus:ring-violet-100" type={type} value={value} onChange={onChange} autoComplete={autoComplete} placeholder={placeholder} required /></label>
}
