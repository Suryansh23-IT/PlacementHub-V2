import { useId } from 'react'

export function FormField({ label, error, hint, as = 'input', className = '', children, ...props }) {
  const descriptionId = useId()
  const Component = as
  const accessibility = { 'aria-invalid': error ? true : props['aria-invalid'], 'aria-describedby': [props['aria-describedby'], (hint || error) && descriptionId].filter(Boolean).join(' ') || undefined }
  const inputClasses = `mt-1.5 block min-h-11 w-full rounded-lg border bg-white px-3 py-2.5 text-sm font-normal text-slate-950 outline-none transition-colors placeholder:text-slate-400 hover:border-slate-400 focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 ${error ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-100' : 'border-slate-300 focus:border-blue-600 focus:ring-blue-100'} ${className}`
  return <label className="block text-sm font-semibold text-slate-800">{label}{props.required && <span aria-hidden="true" className="ml-1 text-slate-500">*</span>}{as === 'select' ? <select className={inputClasses} {...props} {...accessibility}>{children}</select> : as === 'textarea' ? <textarea rows={4} className={inputClasses} {...props} {...accessibility} /> : <Component className={inputClasses} {...props} {...accessibility} />}{hint && !error && <span id={descriptionId} className="mt-1.5 block text-xs font-normal leading-5 text-slate-500">{hint}</span>}{error && <span id={descriptionId} className="mt-1.5 block text-xs font-medium leading-5 text-rose-700" role="alert">{error}</span>}</label>
}
