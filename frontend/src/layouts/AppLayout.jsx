import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../features/auth/useAuth.js'
import nitRaipurLogo from '../assets/nit-raipur-logo.png'

export function AppLayout() {
  const { session, endSession } = useAuth()
  const navigate = useNavigate()

  function handleSignOut() {
    endSession()
    navigate('/')
  }

  return (
    <div className="min-h-screen text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200/90 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 sm:px-6">
          <NavLink className="mr-auto flex shrink-0 items-center gap-2 text-lg font-bold tracking-tight text-violet-700" to="/"><span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg border border-violet-100 bg-white shadow-sm"><img className="h-7 w-7 object-contain" src={nitRaipurLogo} alt="" /></span>PlacementHub</NavLink>
          <div className="flex max-w-full items-center gap-1 overflow-x-auto text-sm sm:gap-1.5"><span className="hidden whitespace-nowrap pr-2 text-xs font-medium text-slate-500 lg:inline">NIT Raipur · Placement Cell</span>{session ? <><HeaderLink to="/dashboard">Dashboard</HeaderLink>{session.user.role === 'student' && <><HeaderLink to="/student/profile">My profile</HeaderLink><HeaderLink to="/student/policy">Policy</HeaderLink></>}{session.user.role === 'company' && <><HeaderLink to="/company/profile">Company profile</HeaderLink><HeaderLink to="/company/placement-drives">Placement drives</HeaderLink><HeaderLink to="/company/policy">Recruiter policy</HeaderLink></>}{session.user.role === 'placement_admin' && <><HeaderLink to="/admin/students">Students</HeaderLink><HeaderLink to="/admin/companies">Companies</HeaderLink><HeaderLink to="/admin/placement-drives">Proposals</HeaderLink><HeaderLink to="/admin/institution">Institution</HeaderLink><HeaderLink to="/admin/student-policy">Student policy</HeaderLink><HeaderLink to="/admin/recruiter-policy">Recruiter policy</HeaderLink></>}<button className="whitespace-nowrap rounded-lg px-2.5 py-2 font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-950" onClick={handleSignOut}>Sign out</button></> : <HeaderLink to="/login">Sign in</HeaderLink>}</div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:py-12"><Outlet /></main>
    </div>
  )
}

function HeaderLink({ to, children }) {
  return <NavLink className={({ isActive }) => `whitespace-nowrap rounded-lg px-2.5 py-2 font-semibold transition ${isActive ? 'bg-violet-50 text-violet-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'}`} to={to}>{children}</NavLink>
}
