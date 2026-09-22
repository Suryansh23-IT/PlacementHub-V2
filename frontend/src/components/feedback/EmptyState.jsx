export function EmptyState({ title, description }) {
  return (
    <section className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <p className="mt-2 text-slate-600">{description}</p>
    </section>
  )
}
