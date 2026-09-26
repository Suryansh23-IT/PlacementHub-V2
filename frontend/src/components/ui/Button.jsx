const VARIANTS = {
  primary: 'bg-gradient-to-r from-violet-700 to-indigo-600 text-white shadow-md shadow-violet-200/80 hover:from-violet-800 hover:to-indigo-700 hover:shadow-lg hover:shadow-violet-200/80 focus-visible:ring-violet-500 disabled:bg-violet-400',
  secondary: 'border border-slate-300 bg-white/90 text-slate-700 shadow-sm hover:border-violet-300 hover:bg-violet-50/50 focus-visible:ring-violet-500',
  danger: 'bg-rose-700 text-white shadow-sm hover:bg-rose-800 focus-visible:ring-rose-500 disabled:bg-rose-400',
  quiet: 'text-slate-700 hover:bg-slate-100 focus-visible:ring-violet-500',
}

export function Button({ variant = 'primary', className = '', type = 'button', children, ...props }) {
  return <button type={type} className={`inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:shadow-none ${VARIANTS[variant]} ${className}`} {...props}>{children}</button>
}
