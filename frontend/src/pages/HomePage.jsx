import { EmptyState } from '../components/feedback/EmptyState.jsx'

export function HomePage() {
  return (
    <div className="space-y-10">
      <section className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-700">Placement management</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">A clear path from profile to placement.</h1>
        <p className="mt-5 text-lg leading-8 text-slate-600">PlacementHub brings students, recruiters, and placement administrators into one reliable workflow.</p>
      </section>
      <EmptyState title="The application foundation is ready." description="Authentication, profiles, jobs, and dashboards will arrive in the next milestones." />
    </div>
  )
}
