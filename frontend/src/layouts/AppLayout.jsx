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
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <NavLink className="text-xl font-bold tracking-tight text-violet-700" to="/">PlacementHub</NavLink>
          <div className="flex items-center gap-4 text-sm"><span className="text-slate-500">College placement cell</span>{session ? <><NavLink className="font-semibold text-violet-700" to="/dashboard">Dashboard</NavLink><button className="font-semibold text-slate-600 hover:text-slate-950" onClick={handleSignOut}>Sign out</button></> : <NavLink className="font-semibold text-violet-700" to="/login">Sign in</NavLink>}</div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-12"><Outlet /></main>
    </div>
  )
}
