export function PageHeader({ eyebrow, title, description, action }) {
  return <div className="flex flex-col gap-5 border-b border-slate-200/80 pb-6 sm:flex-row sm:items-end sm:justify-between">
    <div className="max-w-3xl">
      {eyebrow && <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-700">{eyebrow}</p>}
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-[2.5rem] sm:leading-tight">{title}</h1>
      {description && <p className="mt-3 max-w-2xl leading-7 text-slate-600">{description}</p>}
    </div>
    {action}
  </div>
}
