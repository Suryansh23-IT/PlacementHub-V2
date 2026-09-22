export function ErrorState({ message = 'Something went wrong. Please try again.' }) {
  return <section className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800" role="alert">{message}</section>
}
