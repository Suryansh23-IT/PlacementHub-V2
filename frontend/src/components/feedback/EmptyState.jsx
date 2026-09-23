export function EmptyState({ title, description, action }) {
  return (
    <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center shadow-sm sm:px-10">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-lg font-bold text-violet-700">+</div>
      <h2 className="mt-4 text-lg font-bold text-slate-900">{title}</h2>
      <p className="mx-auto mt-2 max-w-lg leading-6 text-slate-600">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </section>
  )
}
