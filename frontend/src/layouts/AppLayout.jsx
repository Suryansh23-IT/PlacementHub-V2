import { NavLink, Outlet } from 'react-router-dom'

export function AppLayout() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <NavLink className="text-xl font-bold tracking-tight text-violet-700" to="/">PlacementHub</NavLink>
          <span className="text-sm text-slate-500">College placement cell</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-12"><Outlet /></main>
    </div>
  )
}
