export function ErrorState({ message = 'Something went wrong. Please try again.' }) {
  return <section className="rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3.5 text-sm font-semibold leading-6 text-rose-800 shadow-sm shadow-rose-100" role="alert"><span className="mr-2 inline-grid h-5 w-5 place-items-center rounded-full bg-rose-100 text-xs" aria-hidden="true">!</span>{message}</section>
}
