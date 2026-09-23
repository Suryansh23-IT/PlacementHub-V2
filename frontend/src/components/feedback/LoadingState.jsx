export function LoadingState({ message = 'Loading…' }) {
  return <p className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-medium text-slate-600 shadow-sm" role="status"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-violet-500" />{message}</p>
}
