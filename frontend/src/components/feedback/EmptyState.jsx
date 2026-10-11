export function EmptyState({ title, description, action }) {
  return <section className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center sm:px-8 sm:py-10">
    <h2 className="text-base font-semibold text-slate-900">{title}</h2>
    <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">{description}</p>
    {action && <div className="mt-5 flex justify-center">{action}</div>}
  </section>
}
