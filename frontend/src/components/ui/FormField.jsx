export function FormField({ label, error, hint, as = 'input', className = '', children, ...props }) {
  const Component = as
  const inputClasses = `mt-1.5 block w-full rounded-xl border bg-white px-3 py-2.5 text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-100 ${error ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-100' : 'border-slate-300 focus:border-violet-600 focus:ring-violet-100'} ${className}`
  return (
    <label className="block text-sm font-medium text-slate-800">
      {label}
      {as === 'select' ? <select className={inputClasses} {...props}>{children}</select> : as === 'textarea' ? <textarea className={inputClasses} {...props} /> : <Component className={inputClasses} {...props} />}
      {hint && !error && <span className="mt-1.5 block text-xs font-normal leading-5 text-slate-500">{hint}</span>}
      {error && <span className="mt-1.5 block text-xs font-medium leading-5 text-rose-700" role="alert">{error}</span>}
    </label>
  )
}
