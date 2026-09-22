export function ErrorState({ message = 'Something went wrong. Please try again.' }) {
  return <section className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium leading-6 text-rose-800" role="alert">{message}</section>
}
