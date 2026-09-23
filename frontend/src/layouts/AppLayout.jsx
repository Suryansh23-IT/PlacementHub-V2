import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../features/auth/useAuth.js'

export function AppLayout() {
  const { session, endSession } = useAuth()
  const navigate = useNavigate()

  function handleSignOut() {
    endSession()
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200/90 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <NavLink className="flex items-center gap-2 text-xl font-bold tracking-tight text-violet-700" to="/"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-700 text-sm text-white">P</span>PlacementHub</NavLink>
          <div className="flex items-center gap-1 text-sm sm:gap-2"><span className="hidden pr-2 text-slate-500 md:inline">College placement cell</span>{session ? <><HeaderLink to="/dashboard">Dashboard</HeaderLink>{session.user.role === 'student' && <><HeaderLink to="/student/profile">My profile</HeaderLink><HeaderLink to="/student/policy">Policy</HeaderLink></>}{session.user.role === 'company' && <><HeaderLink to="/company/profile">Company profile</HeaderLink><HeaderLink to="/company/policy">Recruiter policy</HeaderLink></>}{session.user.role === 'placement_admin' && <><HeaderLink to="/admin/students">Students</HeaderLink><HeaderLink to="/admin/companies">Companies</HeaderLink><HeaderLink to="/admin/institution">Institution</HeaderLink><HeaderLink to="/admin/student-policy">Student policy</HeaderLink><HeaderLink to="/admin/recruiter-policy">Recruiter policy</HeaderLink></>}<button className="rounded-lg px-2.5 py-2 font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-950" onClick={handleSignOut}>Sign out</button></> : <HeaderLink to="/login">Sign in</HeaderLink>}</div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10"><Outlet /></main>
    </div>
  )
}

function HeaderLink({ to, children }) {
  return <NavLink className={({ isActive }) => `rounded-lg px-2.5 py-2 font-semibold ${isActive ? 'bg-violet-50 text-violet-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'}`} to={to}>{children}</NavLink>
}
