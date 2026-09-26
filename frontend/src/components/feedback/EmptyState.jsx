export function EmptyState({ title, description, action }) {
  return <section className="rounded-2xl border border-dashed border-slate-300 bg-white/80 px-6 py-10 text-center shadow-sm shadow-slate-200/50 sm:px-10 sm:py-12">
    <div className="mx-auto grid h-11 w-11 place-items-center rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 to-sky-50 text-lg font-extrabold text-violet-700 shadow-sm">+</div>
    <h2 className="mt-4 text-lg font-extrabold tracking-tight text-slate-900">{title}</h2>
    <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">{description}</p>
    {action && <div className="mt-5 flex justify-center">{action}</div>}
  </section>
}
