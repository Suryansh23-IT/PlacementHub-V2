import { useAuth } from '../features/auth/useAuth.js'

export function DashboardPage() {
  const { session } = useAuth()
  return <section className="rounded-2xl border border-slate-200 bg-white p-8"><p className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-700">Authenticated session</p><h1 className="mt-3 text-3xl font-bold text-slate-950">Welcome, {session.user.name}.</h1><p className="mt-3 text-slate-600">You are signed in as <span className="font-semibold capitalize">{session.user.role.replace('_', ' ')}</span>. Role-specific placement features will be added in later milestones.</p></section>
}
