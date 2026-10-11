export function LoadingState({ message = 'Loading…' }) {
  return <p className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600" role="status" aria-live="polite"><span aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-200 border-t-blue-700" />{message}</p>
}
