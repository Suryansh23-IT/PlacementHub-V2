import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { BrandLogo } from '../components/brand/BrandLogo.jsx'
import '../styles/public-site.css'
import { ErrorState } from '../components/feedback/ErrorState.jsx'
import { Button } from '../components/ui/Button.jsx'
import { FormField } from '../components/ui/FormField.jsx'
import { useAuth } from '../features/auth/useAuth.js'
import { loginFormSchema } from '../features/auth/auth.schemas.js'
import { loginAccount } from '../services/auth.service.js'
import { loginDestinationForRole } from '../features/auth/role-navigation.js'
import { PlacementCycleSelector } from '../components/placement-cycle/PlacementCycleSelector.jsx'
import { usePlacementCycle } from '../features/placement-cycle/usePlacementCycle.js'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { startSession } = useAuth()
  const { cycle } = usePlacementCycle()
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
      navigate(loginDestinationForRole(data.user.role, location.state?.from), { replace: true })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return <div className="ph-auth"><AuthCard title="Welcome back" description="Sign in to continue your placement journey.">
    <PlacementCycleSelector />
    <p className="mt-3 text-sm text-slate-600">{cycle.label} · {cycle.status}</p>
    {error && <ErrorState message={error} />}
    <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
      <FormField label="Email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="email" placeholder="you@example.com" />
      <FormField label="Password" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} autoComplete="current-password" />
      <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? 'Signing in…' : 'Sign in'}</Button>
    </form>
    <p className="mt-6 text-sm text-slate-600">{cycle.id === '2026' ? 'This archived cycle is available to existing users.' : <>New here? <Link className="font-bold text-blue-700 hover:text-blue-900" to="/register">Create an account</Link>.</>}</p>
  </AuthCard></div>
}

export function AuthCard({ title, description, children }) {
  return <section className="ph-auth-panel mx-auto w-full max-w-5xl"><aside className="ph-auth-aside"><BrandLogo inverse link={false} /><h1>Placement, made easier to navigate.</h1><p>One connected platform for Student readiness, employer hiring, and placement operations.</p></aside><div className="ph-auth-form"><BrandLogo link={false} /><p className="ph-eyebrow mt-9">Apex Institute of Technology · Placement Cell</p><h1 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-950">{title}</h1><p className="mt-3 leading-6 text-slate-600">{description}</p>{children}</div></section>
}
