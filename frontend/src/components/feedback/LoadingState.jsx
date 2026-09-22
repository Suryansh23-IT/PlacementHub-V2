export function LoadingState({ message = 'Loading…' }) {
  return <p className="text-slate-600" role="status">{message}</p>
}
