import { useEffect, useState } from 'react'
import { FormField } from '../../components/ui/FormField.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { socialProfileSchemas, personalityTypes } from './profile.schemas.js'
import { updateSocialProfile } from '../../services/profile.service.js'
const studentGroups = [
  ['Personality & interests', ['hobbies','interests','languages']],
  ['Skills & growth', ['softSkills','currentlyLearning','lookingToExplore']],
  ['Campus life', ['achievementHighlights','clubs','extracurriculars','volunteering']],
]
const labels = { hobbies: 'Hobbies', interests: 'Interests', languages: 'Languages', softSkills: 'Soft skills', currentlyLearning: 'Currently learning', lookingToExplore: 'Looking to explore', achievementHighlights: 'Achievement highlights', clubs: 'Clubs / societies', extracurriculars: 'Extracurricular activities', volunteering: 'Volunteering', companyName: 'Company name', industry: 'Industry', location: 'Location', website: 'Website', hiringDomains: 'Hiring domains', representativeName: 'Representative name', designation: 'Designation', publicEmail: 'Public professional email', publicPhone: 'Public phone (optional)', representativeNote: 'Representative note' }
export function SocialProfileEditor({ profile, token, onSaved, onCancel }) {
  const [values, setValues] = useState(() => ({ ...profile, bio: profile.about || '', companyName: profile.name }))
  const [image, setImage] = useState(null), [removeImage, setRemoveImage] = useState(false), [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  const set = (key, value) => setValues(current => ({ ...current, [key]: value }))
  const field = (key, list = false) => <FormField key={key} label={labels[key] || key} as={list ? 'textarea' : 'input'} value={list ? (typeof values[key] === 'string' ? values[key] : (values[key] || []).join(key === 'achievementHighlights' ? '\n' : ', ')) : values[key] || ''} onChange={e => set(key, e.target.value)} />
  async function save(event) {
    event.preventDefault(); setError('')
    const input = Object.fromEntries(Object.keys(socialProfileSchemas[profile.role].shape).filter(k => k !== 'removeImage').map(k => [k, values[k] ?? (k === 'links' ? {} : ['hobbies','interests','softSkills','achievementHighlights','clubs','extracurriculars','volunteering','languages','currentlyLearning','lookingToExplore','hiringDomains'].includes(k) ? [] : '')]))
    for (const key of ['hobbies','interests','softSkills','achievementHighlights','clubs','extracurriculars','volunteering','languages','currentlyLearning','lookingToExplore','hiringDomains']) if (typeof input[key] === 'string') input[key] = input[key].split(key === 'achievementHighlights' ? '\n' : ',').map(s => s.trim()).filter(Boolean)
    const parsed = socialProfileSchemas[profile.role].safeParse(input)
    if (!parsed.success) return setError(parsed.error.issues[0].message)
    setBusy(true)
    try { const response = await updateSocialProfile(token, profile.userId, parsed.data, image, removeImage); onSaved(response.data) } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return <form className="space-y-5 rounded-2xl border border-blue-100 bg-white p-5" onSubmit={save}>
    <h2 className="text-lg font-bold text-blue-950">Edit Social Profile</h2>
    <p className="text-sm text-slate-600">These changes affect your Community identity only. Your Main Profile and placement records stay unchanged.</p>
    <fieldset disabled={busy} className="space-y-4">
      <legend className="mb-3 font-semibold">Basic</legend>
      <FormField label="Headline" value={values.headline || ''} maxLength={160} onChange={e => set('headline', e.target.value)} />
      <FormField as="textarea" label="About Me / bio" value={values.bio} maxLength={1200} onChange={e => set('bio', e.target.value)} />
      {profile.role !== 'placement_admin' && <div className="space-y-2 text-sm"><label className="block font-semibold">Profile image<input aria-label="Profile image" type="file" accept="image/jpeg,image/png,image/webp" className="mt-2 block max-w-full" onChange={e => { const file = e.target.files?.[0]; setImage(file || null); setRemoveImage(false); setPreview(file ? URL.createObjectURL(file) : '') }} /></label><p className="text-xs text-slate-500">One JPEG, PNG or WebP, up to 5 MB.</p>{preview && <img src={preview} alt="Social image preview" className="h-24 w-24 rounded-full object-cover" />}{profile.hasAvatar && !image && <label><input type="checkbox" checked={removeImage} onChange={e => setRemoveImage(e.target.checked)} /> Remove profile image</label>}</div>}
      {profile.role === 'student' ? <>
        {studentGroups.map(([title, keys]) => <section key={title} className="space-y-3 border-t pt-4"><h3 className="font-semibold">{title}</h3><p className="text-xs text-slate-500">Separate tags with commas; achievement highlights use one line each.</p>{keys.map(key => field(key, true))}</section>)}
        <label className="block text-sm font-semibold">Personality / MBTI<select aria-label="Personality / MBTI" className="ml-2 max-w-full rounded-lg border p-2" value={values.personalityType || ''} onChange={e => set('personalityType', e.target.value)}><option value="">Prefer not to say</option>{personalityTypes.map(type => <option key={type}>{type}</option>)}</select></label>
        <section className="space-y-3 border-t pt-4"><h3 className="font-semibold">Links</h3>{['linkedin','github','portfolio','codingProfile'].map(key => <FormField key={key} label={key === 'codingProfile' ? 'Coding profile' : key} value={values.links?.[key] || ''} onChange={e => set('links', { ...values.links, [key]: e.target.value })} />)}</section>
      </> : <>
        {profile.role === 'company' && <section className="space-y-3 border-t pt-4"><h3 className="font-semibold">Company identity</h3>{['companyName','industry','location','website'].map(key => field(key))}{field('hiringDomains', true)}</section>}
        <section className="space-y-3 border-t pt-4"><h3 className="font-semibold">Public representative contact</h3><p className="text-sm text-slate-600">Only enter contact details you intend all authenticated Community users to see. Login email is never copied here.</p>{['representativeName','designation','publicEmail','publicPhone','representativeNote'].map(key => field(key))}</section>
      </>}
    </fieldset>
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    <div className="flex gap-2"><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save Social Profile'}</Button><Button variant="quiet" disabled={busy} onClick={onCancel}>Cancel</Button></div>
  </form>
}
