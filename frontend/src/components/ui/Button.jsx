const VARIANTS = {
  primary: 'border border-blue-700 bg-blue-700 text-white hover:border-blue-800 hover:bg-blue-800 focus-visible:ring-blue-500',
  secondary: 'border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50 focus-visible:ring-blue-500',
  danger: 'bg-rose-700 text-white shadow-sm hover:bg-rose-800 focus-visible:ring-rose-500 disabled:bg-rose-400',
  quiet: 'text-slate-700 hover:bg-slate-100 focus-visible:ring-blue-500',
  ghost: 'text-slate-700 hover:bg-slate-100 focus-visible:ring-blue-500',
}

export function Button({ variant = 'primary', className = '', type = 'button', children, ...props }) {
  return <button type={type} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none ${VARIANTS[variant] ?? VARIANTS.primary} ${className}`} {...props}>{children}</button>
}
