export function AiComingSoon({ area }) {
  return <section aria-label={`${area} — Coming Soon`} className="relative overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800 p-6 text-white shadow-sm sm:p-8">
    <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full border border-white/10 bg-white/5" />
    <p className="relative text-xs font-bold uppercase tracking-widest text-blue-200">{area}</p>
    <h2 className="relative mt-3 text-xl font-bold sm:text-2xl">AI Intelligence — Coming Soon</h2>
    <p className="relative mt-3 max-w-xl text-sm leading-6 text-blue-100">Intelligent guidance is planned for a future release. Your placement tools and workflows are ready to use.</p>
    <span className="relative mt-5 inline-flex rounded-full border border-blue-300/30 bg-white/10 px-3 py-1 text-xs font-semibold text-blue-100">Coming Soon</span>
  </section>
}
