export function LoadingState({ message = 'Loading…' }) {
  return <p className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/85 px-5 py-4 text-sm font-semibold text-slate-600 shadow-sm shadow-slate-200/50" role="status"><span className="grid h-6 w-6 place-items-center rounded-full bg-violet-50"><span className="h-2 w-2 animate-pulse rounded-full bg-violet-600" /></span>{message}</p>
}
