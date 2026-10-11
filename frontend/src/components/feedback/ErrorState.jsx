export function ErrorState({ message = 'Something went wrong. Please try again.' }) {
  return <section className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3.5 text-sm font-medium leading-6 text-rose-800" role="alert"><span className="mr-2 inline-grid h-5 w-5 place-items-center rounded-full bg-rose-100 text-xs" aria-hidden="true">!</span>{message}</section>
}
