import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ErrorState } from '../components/feedback/ErrorState.jsx'
import { Button } from '../components/ui/Button.jsx'
import { FormField } from '../components/ui/FormField.jsx'
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
    <AuthCard title="Welcome back" description="Sign in to continue your placement journey.">
      {error && <ErrorState message={error} />}
      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <FormField label="Email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="email" placeholder="you@example.com" />
        <FormField label="Password" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} autoComplete="current-password" />
        <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? 'Signing in…' : 'Sign in'}</Button>
      </form>
      <p className="mt-5 text-sm text-slate-600">New here? <Link className="font-semibold text-violet-700" to="/register">Create an account</Link>.</p>
    </AuthCard>
  )
}

export function AuthCard({ title, description, children }) {
  return <section className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/50 sm:p-8"><p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-700">PlacementHub</p><h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">{title}</h1><p className="mt-2 leading-6 text-slate-600">{description}</p>{children}</section>
}
