export function PageHeader({ eyebrow, title, description, action }) {
  return <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
    <div className="max-w-2xl">
      {eyebrow && <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-700">{eyebrow}</p>}
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">{title}</h1>
      {description && <p className="mt-3 leading-7 text-slate-600">{description}</p>}
    </div>
    {action}
  </div>
}
