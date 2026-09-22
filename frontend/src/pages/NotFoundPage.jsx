import { NavLink } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-8">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="mt-2 text-slate-600">The page you requested does not exist.</p>
      <NavLink className="mt-5 inline-block font-semibold text-violet-700 hover:text-violet-900" to="/">Return home</NavLink>
    </section>
  )
}
