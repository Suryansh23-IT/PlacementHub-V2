export function EmptyState({ title, description }) {
  return (
    <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center shadow-sm sm:p-8">
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      <p className="mx-auto mt-2 max-w-lg leading-6 text-slate-600">{description}</p>
    </section>
  )
}
