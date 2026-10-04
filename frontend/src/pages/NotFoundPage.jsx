import { NavLink } from 'react-router-dom'
import { useAuth } from '../features/auth/useAuth.js'

export function NotFoundPage() {
  const { session } = useAuth()
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-8">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="mt-2 text-slate-600">The page you requested does not exist.</p>
      <NavLink className="mt-5 inline-block font-semibold text-blue-700 hover:text-blue-900" to={session ? '/dashboard' : '/'}>Return home</NavLink>
    </section>
  )
}
