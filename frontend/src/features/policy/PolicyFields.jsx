import { FormField } from '../../components/ui/FormField.jsx'

export function PolicyFields({ form, onChange, readOnly = false }) {
  return <>
    <div className="grid gap-4 md:grid-cols-3">
      <FormField label="Title" value={form.title} readOnly={readOnly} onChange={event => onChange('title', event.target.value)} />
      <FormField label="Academic year" value={form.academicYear} readOnly={readOnly} onChange={event => onChange('academicYear', event.target.value)} />
      <FormField label="Version" value={form.version} readOnly={readOnly} onChange={event => onChange('version', event.target.value)} />
    </div>
    <FormField as="textarea" rows="24" label="Policy text" value={form.policyText} readOnly={readOnly} onChange={event => onChange('policyText', event.target.value)} />
    <label className="flex items-center gap-2 text-sm font-semibold text-slate-800"><input type="checkbox" checked={form.active} onChange={event => onChange('active', event.target.checked)} />Active policy</label>
  </>
}
