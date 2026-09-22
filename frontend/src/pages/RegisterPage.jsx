import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ErrorState } from '../components/feedback/ErrorState.jsx'
import { Button } from '../components/ui/Button.jsx'
import { FormField } from '../components/ui/FormField.jsx'
import { useAuth } from '../features/auth/useAuth.js'
import { registerFormSchema } from '../features/auth/auth.schemas.js'
import { registerAccount } from '../services/auth.service.js'

const ROLE_DETAILS = {
  student: {
    eyebrow: 'Student account',
    title: 'Start your placement journey.',
    description: 'Create your secure account first. Your academic profile and verification come next.',
    nameLabel: 'Full name',
    emailLabel: 'College email',
    note: 'Your branch, academic details, skills, projects, resume, and verification are completed later.',
  },
  company: {
    eyebrow: 'Company account',
    title: 'Create recruiter access.',
    description: 'Set up the secure account your recruitment contact will use for campus hiring.',
    nameLabel: 'Recruiter name',
    emailLabel: 'Work email',
    note: 'Company details, approval, job creation, and recruiter profile information are completed later.',
  },
}

const ROLE_OPTIONS = [
  { value: 'student', title: 'Student', description: 'Build your placement-ready account.', marker: 'S' },
  { value: 'company', title: 'Company', description: 'Create recruiter access for campus hiring.', marker: 'C' },
]

export function RegisterPage() {
  const navigate = useNavigate()
  const { startSession } = useAuth()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '', role: '' })
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const roleDetails = form.role ? ROLE_DETAILS[form.role] : null

  function selectRole(role) {
    setForm({ ...form, role })
    setError('')
  }

  function continueToDetails() {
    if (!form.role) return setError('Choose whether you are registering as a Student or Company.')
    setError('')
    setStep(2)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    const validation = registerFormSchema.safeParse(form)
    if (!validation.success) return setError(validation.error.issues[0].message)

    setIsSubmitting(true)
    try {
      const registration = {
        name: validation.data.name,
        email: validation.data.email,
        password: validation.data.password,
        role: validation.data.role,
      }
      const { data } = await registerAccount(registration)
      startSession(data)
      navigate('/dashboard', { replace: true })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="mx-auto grid max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[0.9fr_1.1fr]">
      <aside className="bg-gradient-to-br from-violet-800 via-violet-700 to-indigo-800 p-8 text-white sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-200">PlacementHub</p>
        <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">One account. A clearer placement journey.</h1>
        <p className="mt-4 max-w-sm leading-7 text-violet-100">Begin with a secure identity. The right placement tools will appear as your account progresses through the platform.</p>
        <ol className="mt-10 space-y-5" aria-label="Registration progress">
          <ProgressItem active={step === 1} number="1" title="Choose your account" text="Student or Company" />
          <ProgressItem active={step === 2} number="2" title="Secure your sign-in" text="Account identity and password" />
        </ol>
      </aside>

      <div className="p-6 sm:p-10">
        {step === 1 ? <RoleSelection form={form} error={error} onSelect={selectRole} onContinue={continueToDetails} /> : <AccountDetails form={form} details={roleDetails} error={error} isSubmitting={isSubmitting} onChange={(field, value) => setForm({ ...form, [field]: value })} onBack={() => { setError(''); setStep(1) }} onSubmit={handleSubmit} />}
      </div>
    </section>
  )
}

function RoleSelection({ form, error, onSelect, onContinue }) {
  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-700">Step 1 of 2</p>
      <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">How will you use PlacementHub?</h2>
      <p className="mt-3 text-slate-600">Choose the account type that matches your role today.</p>
      {error && <div className="mt-5"><ErrorState message={error} /></div>}
      <fieldset className="mt-7 space-y-4">
        <legend className="sr-only">Account type</legend>
        {ROLE_OPTIONS.map((option) => {
          const selected = form.role === option.value
          return <button key={option.value} type="button" className={`flex w-full items-start gap-4 rounded-2xl border p-5 text-left transition focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 ${selected ? 'border-violet-700 bg-violet-50 shadow-sm' : 'border-slate-200 bg-white hover:border-violet-300 hover:bg-violet-50/40'}`} onClick={() => onSelect(option.value)} aria-pressed={selected}>
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${selected ? 'bg-violet-700 text-white' : 'bg-slate-100 text-slate-700'}`} aria-hidden="true">{option.marker}</span>
            <span><span className="block text-lg font-semibold text-slate-950">{option.title}</span><span className="mt-1 block leading-6 text-slate-600">{option.description}</span></span>
          </button>
        })}
      </fieldset>
      <Button className="mt-7 w-full" onClick={onContinue} disabled={!form.role}>Continue</Button>
      <p className="mt-5 text-sm text-slate-600">Already registered? <Link className="font-semibold text-violet-700" to="/login">Sign in</Link>.</p>
    </div>
  )
}

function AccountDetails({ form, details, error, isSubmitting, onChange, onBack, onSubmit }) {
  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-700">Step 2 of 2 · {details.eyebrow}</p>
      <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">{details.title}</h2>
      <p className="mt-3 leading-6 text-slate-600">{details.description}</p>
      {error && <div className="mt-5"><ErrorState message={error} /></div>}
      <form className="mt-7 space-y-4" onSubmit={onSubmit}>
        <FormField label={details.nameLabel} type="text" value={form.name} onChange={(event) => onChange('name', event.target.value)} autoComplete="name" />
        <FormField label={details.emailLabel} type="email" value={form.email} onChange={(event) => onChange('email', event.target.value)} autoComplete="email" />
        <FormField label="Password" type="password" value={form.password} onChange={(event) => onChange('password', event.target.value)} autoComplete="new-password" placeholder="At least 8 characters" />
        <FormField label="Confirm password" type="password" value={form.confirmPassword} onChange={(event) => onChange('confirmPassword', event.target.value)} autoComplete="new-password" />
        <p className="rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">{details.note}</p>
        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
          <Button variant="quiet" className="sm:w-auto" onClick={onBack} disabled={isSubmitting}>Back</Button>
          <Button type="submit" className="flex-1" disabled={isSubmitting}>{isSubmitting ? 'Creating account…' : `Create ${details.eyebrow}`}</Button>
        </div>
      </form>
      <p className="mt-5 text-sm text-slate-600">Already registered? <Link className="font-semibold text-violet-700" to="/login">Sign in</Link>.</p>
    </div>
  )
}

function ProgressItem({ active, number, title, text }) {
  return <li className="flex items-center gap-3"><span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${active ? 'bg-white text-violet-800' : 'bg-violet-600 text-violet-100'}`}>{number}</span><span><span className="block font-semibold">{title}</span><span className="text-sm text-violet-200">{text}</span></span></li>
}
