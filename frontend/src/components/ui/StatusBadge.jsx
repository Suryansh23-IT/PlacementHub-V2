const STATUS_STYLES = {
  pending: 'border-amber-200 bg-amber-50 text-amber-800',
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  verified: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  rejected: 'border-rose-200 bg-rose-50 text-rose-800',
  draft: 'border-slate-200 bg-slate-100 text-slate-700',
  submitted: 'border-amber-200 bg-amber-50 text-amber-800',
  changes_requested: 'border-amber-200 bg-amber-50 text-amber-800',
  unpublished: 'border-slate-200 bg-slate-100 text-slate-700',
  published: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  postponed: 'border-amber-200 bg-amber-50 text-amber-800',
  cancelled: 'border-rose-200 bg-rose-50 text-rose-800',
  completed: 'border-violet-200 bg-violet-50 text-violet-800',
  neutral: 'border-slate-200 bg-slate-100 text-slate-700',
}

export function StatusBadge({ status, children }) {
  const label = children ?? status?.replace('_', ' ')
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold capitalize ${STATUS_STYLES[status] ?? STATUS_STYLES.neutral}`}>{label}</span>
}
