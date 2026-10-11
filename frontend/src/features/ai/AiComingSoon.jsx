export function AiComingSoon({ area }) {
  return <section aria-label={`${area} — Coming Soon`} className="rounded-xl border border-slate-200 border-l-4 border-l-blue-800 bg-white p-5 sm:p-6">
    <div className="flex items-start gap-3"><span aria-hidden="true" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-800"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 3 14.5 9.5 21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" /></svg></span><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-blue-800">{area}</p><h2 className="mt-1 text-lg font-semibold text-slate-950">AI Intelligence — Coming Soon</h2></div></div>
    <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">Intelligent guidance is planned for a future release. Your placement tools and workflows are ready to use.</p>
    <span className="mt-4 inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600">Coming Soon</span>
  </section>
}
