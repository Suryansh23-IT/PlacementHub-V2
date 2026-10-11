const STATUS_STYLES = {
  pending: 'border-amber-200 bg-amber-50 text-amber-800',
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  verified: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  placed: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  placement_confirmed: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  selected_pending_confirmation: 'border-amber-200 bg-amber-50 text-amber-800',
  selected: 'border-blue-200 bg-blue-50 text-blue-800',
  active: 'border-blue-200 bg-blue-50 text-blue-800',
  inactive: 'border-slate-200 bg-slate-100 text-slate-700',
  rejected: 'border-rose-200 bg-rose-50 text-rose-800',
  draft: 'border-slate-200 bg-slate-100 text-slate-700',
  submitted: 'border-amber-200 bg-amber-50 text-amber-800',
  pending_review: 'border-amber-200 bg-amber-50 text-amber-800',
  referred: 'border-blue-200 bg-blue-50 text-blue-800',
  closed: 'border-slate-200 bg-slate-100 text-slate-700',
  changes_requested: 'border-amber-200 bg-amber-50 text-amber-800',
  unpublished: 'border-slate-200 bg-slate-100 text-slate-700',
  published: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  postponed: 'border-amber-200 bg-amber-50 text-amber-800',
  cancelled: 'border-rose-200 bg-rose-50 text-rose-800',
  completed: 'border-blue-200 bg-blue-50 text-blue-800',
  applied: 'border-blue-200 bg-blue-50 text-blue-800',
  withdrawn: 'border-slate-200 bg-slate-100 text-slate-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  error: 'border-rose-200 bg-rose-50 text-rose-800',
  neutral: 'border-slate-200 bg-slate-100 text-slate-700',
}

export function StatusBadge({ status, children }) {
  const label = children ?? status?.replaceAll('_', ' ')
  return <span className={`inline-flex w-fit max-w-full items-center rounded-md border px-2 py-0.5 text-xs font-semibold leading-5 capitalize ${STATUS_STYLES[status] ?? STATUS_STYLES.neutral}`}>{label}</span>
}
