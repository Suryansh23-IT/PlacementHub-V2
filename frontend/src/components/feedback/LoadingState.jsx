export function LoadingState({ message = 'Loading…' }) {
  return <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 shadow-sm" role="status">{message}</p>
}
