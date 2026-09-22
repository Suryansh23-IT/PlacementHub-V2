import { useAuth } from '../features/auth/useAuth.js'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/ui/PageHeader.jsx'
import { StatusBadge } from '../components/ui/StatusBadge.jsx'

export function DashboardPage() {
  const { session } = useAuth()
  const isStudent = session.user.role === 'student'
  const isAdmin = session.user.role === 'placement_admin'
  return <section className="space-y-8"><PageHeader eyebrow="Your workspace" title={`Welcome, ${session.user.name}.`} description="Your account is secure and ready for the next step in your placement journey." /><div className="grid gap-5 md:grid-cols-2"><section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><p className="text-sm font-semibold text-slate-500">Signed in as</p><p className="mt-3"><StatusBadge status="neutral">{session.user.role.replace('_', ' ')}</StatusBadge></p><p className="mt-4 leading-6 text-slate-600">Role-based access is checked by the server on every protected request.</p></section>{isStudent && <DashboardLink title="Complete your student profile" description="Add your academic details, skills, projects, and PDF resume. It starts in pending verification." to="/student/profile" action="Open profile" />}{isAdmin && <DashboardLink title="Review student profiles" description="Review pending student profiles and record a verified or rejected decision." to="/admin/students" action="Open reviews" />}{!isStudent && !isAdmin && <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-lg font-bold text-slate-950">Your workspace is growing</h2><p className="mt-2 leading-6 text-slate-600">Company profile and hiring tools arrive in the next approved milestones.</p></section>}</div></section>
}

function DashboardLink({ title, description, to, action }) {
  return <Link to={to} className="rounded-2xl border border-violet-200 bg-violet-50 p-6 shadow-sm transition hover:border-violet-300 hover:shadow-md"><h2 className="text-lg font-bold text-slate-950">{title}</h2><p className="mt-2 leading-6 text-slate-600">{description}</p><span className="mt-5 inline-block text-sm font-bold text-violet-700">{action} →</span></Link>
}
