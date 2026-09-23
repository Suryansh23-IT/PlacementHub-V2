import { useEffect, useState } from 'react'
import { Button } from '../components/ui/Button.jsx'
import { FormField } from '../components/ui/FormField.jsx'
import { PageHeader } from '../components/ui/PageHeader.jsx'
import { StatusBadge } from '../components/ui/StatusBadge.jsx'
import { useAuth } from '../features/auth/useAuth.js'
import {
  downloadMyDocument,
  getAvailableBranches,
  getMyStudentProfile,
  resubmitMyProfileForVerification,
  updateMyStudentProfile,
  uploadMyMarksheet,
  uploadMyResume,
} from '../services/student.service.js'

const empty = {
  phone: '', rollNumber: '', branch: '', graduationYear: '', cgpa: '', activeBacklogs: 0,
  class10: { board: '', schoolName: '', passingYear: '', score: '' },
  class12: { board: '', schoolName: '', passingYear: '', score: '' },
  semesterSpis: [], skillGroups: [], projects: [], skills: [],
  professionalLinks: { linkedin: '', github: '', portfolio: '' }, codingProfiles: [],
}

const completionLabels = {
  basicDetails: 'Basic and college details', class10: 'Class 10 record', class12: 'Class 12 record',
  collegeAcademic: 'College academics', skillGroups: 'Skill groups', projects: 'Projects', resume: 'Resume', collegeResult: 'College result / grade sheet',
}

const formFrom = (profile) => ({
  ...empty, ...profile,
  class10: { ...empty.class10, ...profile.class10 },
  class12: { ...empty.class12, ...profile.class12 },
  semesterSpis: profile.semesterSpis ?? [], skillGroups: profile.skillGroups ?? [], projects: profile.projects ?? [],
  professionalLinks: { ...empty.professionalLinks, ...profile.professionalLinks }, codingProfiles: profile.codingProfiles ?? [],
})

export function StudentProfilePage() {
  const { session } = useAuth()
  const [profile, setProfile] = useState(null)
  const [form, setForm] = useState(empty)
  const [branches, setBranches] = useState([])
  const [message, setMessage] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [busyDocument, setBusyDocument] = useState('')
  const [isResubmitting, setIsResubmitting] = useState(false)

  useEffect(() => {
    getMyStudentProfile(session.accessToken).then(({ data }) => { setProfile(data); setForm(formFrom(data)) }).catch((error) => setMessage({ type: 'error', text: error.message })).finally(() => setIsLoading(false))
    getAvailableBranches(session.accessToken).then(({ data }) => setBranches(data)).catch(() => setBranches([]))
  }, [session.accessToken])

  const change = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const nested = (key, field, value) => setForm((current) => ({ ...current, [key]: { ...current[key], [field]: value } }))
  const applyProfile = (data) => { setProfile(data); setForm(formFrom(data)) }

  async function save(event) {
    event.preventDefault()
    setIsSaving(true)
    try {
      const payload = {
        ...form,
        graduationYear: Number(form.graduationYear), cgpa: Number(form.cgpa), activeBacklogs: Number(form.activeBacklogs),
        class10: { ...form.class10, passingYear: Number(form.class10.passingYear), score: Number(form.class10.score) },
        class12: { ...form.class12, passingYear: Number(form.class12.passingYear), score: Number(form.class12.score) },
        semesterSpis: form.semesterSpis.map((item) => ({ semester: Number(item.semester), spi: Number(item.spi) })),
        skillGroups: form.skillGroups.map((item) => ({ ...item, skills: String(item.skills).split(',').map((skill) => skill.trim()).filter(Boolean) })),
        projects: form.projects.map((item) => ({ ...item, technologies: String(item.technologies).split(',').map((skill) => skill.trim()).filter(Boolean) })),
        professionalLinks: form.professionalLinks,
        codingProfiles: form.codingProfiles,
      }
      const { data } = await updateMyStudentProfile(session.accessToken, payload)
      const needsFreshReview = profile.verificationStatus === 'verified' && data.verificationStatus === 'pending'
      applyProfile(data)
      setMessage({ type: 'success', text: needsFreshReview ? 'Placement profile saved. Your updated placement information now requires fresh verification.' : 'Placement profile saved.' })
    } catch (error) { setMessage({ type: 'error', text: error.message }) } finally { setIsSaving(false) }
  }

  async function upload(type, file) {
    if (!file) return
    setBusyDocument(type)
    try {
      const { data } = type === 'resume' ? await uploadMyResume(session.accessToken, file) : await uploadMyMarksheet(session.accessToken, type, file)
      const needsFreshReview = profile.verificationStatus === 'verified' && data.verificationStatus === 'pending'
      // Uploads return the persisted profile but must not erase unrelated edits
      // the student has not saved yet.
      setProfile(data)
      setMessage({ type: 'success', text: needsFreshReview ? 'Resume replaced. Your profile now requires fresh verification.' : 'Document uploaded.' })
    } catch (error) { setMessage({ type: 'error', text: error.message }) } finally { setBusyDocument('') }
  }

  async function download(type, originalName) {
    try {
      const blob = await downloadMyDocument(session.accessToken, type)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = originalName || `${type}.pdf`
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (error) { setMessage({ type: 'error', text: error.message }) }
  }

  async function view(type) {
    const viewer = window.open('', '_blank')
    if (!viewer) {
      setMessage({ type: 'error', text: 'Your browser blocked the document viewer. Allow pop-ups for PlacementHub and try again.' })
      return
    }
    try {
      const blob = await downloadMyDocument(session.accessToken, type)
      const url = URL.createObjectURL(blob)
      viewer.opener = null
      viewer.location.href = url
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (error) { viewer.close(); setMessage({ type: 'error', text: error.message }) }
  }

  async function resubmit() {
    setIsResubmitting(true)
    try {
      const { data } = await resubmitMyProfileForVerification(session.accessToken)
      applyProfile(data)
      setMessage({ type: 'success', text: 'Your corrected profile is pending Placement Admin review.' })
    } catch (error) { setMessage({ type: 'error', text: error.message }) } finally { setIsResubmitting(false) }
  }

  if (isLoading) return <LoadingState />
  if (!profile) return <Feedback type="error">{message?.text ?? 'Your placement profile could not be loaded.'}</Feedback>

  const checks = Object.entries(profile.completion?.checks ?? {})
  const isRejected = profile.verificationStatus === 'rejected'
  const isPending = profile.verificationStatus === 'pending'

  return <section className="space-y-8">
    <PageHeader eyebrow="Student record" title="Placement profile" description="Keep your placement information accurate and ready for review." action={<StatusBadge status={profile.verificationStatus} />} />
    {message && <Feedback type={message.type}>{message.text}</Feedback>}

    <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="rounded-2xl border border-violet-100 bg-violet-50/60 p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-700">Profile review</p>
        <div className="mt-3 flex flex-wrap items-center gap-3"><h2 className="text-xl font-bold tracking-tight text-slate-950">Verification status</h2><StatusBadge status={profile.verificationStatus} /></div>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{isRejected ? 'Review the feedback, correct the relevant information, then explicitly resubmit your profile.' : isPending ? 'Your profile is pending Placement Admin review. Changes to placement-critical information require a fresh review.' : 'Your profile has been verified by the Placement Cell. Material academic changes or a new resume will require fresh verification.'}</p>
        {isRejected && profile.rejectionReason && <p className="mt-4 rounded-xl border border-rose-200 bg-white px-4 py-3 text-sm leading-6 text-rose-800"><span className="font-bold">Admin feedback:</span> {profile.rejectionReason}</p>}
        {isRejected && <Button className="mt-4" onClick={resubmit} disabled={isResubmitting}>{isResubmitting ? 'Resubmitting…' : 'Resubmit for verification'}</Button>}
      </div>
      <CompletionSummary percentage={profile.completion?.percentage ?? 0} checks={checks} />
    </section>

    <form className="space-y-8" onSubmit={save}>
      <ProfileSection title="Basic & college details" description="Use the same details you provide to your college placement cell.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <FormField label="Phone number" value={form.phone} onChange={(event) => change('phone', event.target.value)} />
          <FormField label="Roll / enrollment number" value={form.rollNumber} onChange={(event) => change('rollNumber', event.target.value)} />
          <FormField as="select" label="Branch" value={form.branch} onChange={(event) => change('branch', event.target.value)}><option value="">{branches.length ? 'Select your branch' : 'No branches configured'}</option>{branches.map((branch) => <option key={branch} value={branch}>{branch}</option>)}</FormField>
          <FormField label="Graduation year" type="number" value={form.graduationYear} onChange={(event) => change('graduationYear', event.target.value)} />
          <FormField label="CPI / CGPA" type="number" step="0.01" value={form.cgpa} onChange={(event) => change('cgpa', event.target.value)} />
          <FormField label="Active backlogs" type="number" min="0" value={form.activeBacklogs} onChange={(event) => change('activeBacklogs', event.target.value)} />
        </div>
      </ProfileSection>

      <ProfileSection title="Academic records" description="Enter the academic information shown in your official records.">
        <div className="grid gap-5 xl:grid-cols-2"><AcademicRecord title="Class 10" value={form.class10} onChange={(key, value) => nested('class10', key, value)} /><AcademicRecord title="Class 12" value={form.class12} onChange={(key, value) => nested('class12', key, value)} /></div>
        <div className="mt-6 border-t border-slate-100 pt-6"><RepeatableSection title="Semester SPI" description="Add only semesters you have completed." items={form.semesterSpis} fields={['semester', 'spi']} maxItems={8} add={() => change('semesterSpis', [...form.semesterSpis, { semester: form.semesterSpis.length + 1, spi: '' }])} onChange={(items) => change('semesterSpis', items)} /></div>
      </ProfileSection>

      <ProfileSection title="Skills" description="Group related skills so reviewers can understand your strengths at a glance.">
        <RepeatableSection title="Skill groups" description="Use a meaningful category such as Programming, Tools, or Design." items={form.skillGroups} fields={['name', 'skills']} maxItems={3} add={() => change('skillGroups', [...form.skillGroups, { name: '', skills: '' }])} onChange={(items) => change('skillGroups', items)} />
      </ProfileSection>

      <ProfileSection title="Projects" description="Show the projects most relevant to your placement preparation.">
        <RepeatableSection title="Projects" description="Add up to three projects, including the tools or technologies used." items={form.projects} fields={['title', 'description', 'technologies', 'url']} maxItems={3} add={() => change('projects', [...form.projects, { title: '', description: '', technologies: '', url: '' }])} onChange={(items) => change('projects', items)} />
      </ProfileSection>

      <ProfileSection title="Professional presence" description="Optional links help reviewers understand your public work. They do not affect verification.">
        <div className="grid gap-4 md:grid-cols-3"><FormField label="LinkedIn URL" type="url" value={form.professionalLinks.linkedin} onChange={(event) => setForm((current) => ({ ...current, professionalLinks: { ...current.professionalLinks, linkedin: event.target.value } }))} /><FormField label="GitHub URL" type="url" value={form.professionalLinks.github} onChange={(event) => setForm((current) => ({ ...current, professionalLinks: { ...current.professionalLinks, github: event.target.value } }))} /><FormField label="Portfolio website" type="url" value={form.professionalLinks.portfolio} onChange={(event) => setForm((current) => ({ ...current, professionalLinks: { ...current.professionalLinks, portfolio: event.target.value } }))} /></div>
        <div className="mt-6 border-t border-slate-100 pt-6"><CodingProfiles items={form.codingProfiles} onChange={(codingProfiles) => change('codingProfiles', codingProfiles)} /></div>
      </ProfileSection>

      <ProfileSection title="Documents" description="Your resume and college result are required for placement verification. School marksheets are optional supporting documents.">
        <div className="divide-y divide-slate-100">
          <DocumentRow label="Resume" required file={profile.resume} busy={busyDocument === 'resume'} onUpload={(file) => upload('resume', file)} onView={() => view('resume')} onDownload={() => download('resume', profile.resume?.originalName)} />
          <DocumentRow label="Class 10 marksheet" file={profile.class10?.marksheet} busy={busyDocument === 'class10'} onUpload={(file) => upload('class10', file)} onView={() => view('class10')} onDownload={() => download('class10', profile.class10?.marksheet?.originalName)} />
          <DocumentRow label="Class 12 marksheet" file={profile.class12?.marksheet} busy={busyDocument === 'class12'} onUpload={(file) => upload('class12', file)} onView={() => view('class12')} onDownload={() => download('class12', profile.class12?.marksheet?.originalName)} />
          <DocumentRow label="College result / grade sheet" required file={profile.collegeResult} busy={busyDocument === 'collegeResult'} onUpload={(file) => upload('collegeResult', file)} onView={() => view('collegeResult')} onDownload={() => download('collegeResult', profile.collegeResult?.originalName)} />
        </div>
      </ProfileSection>

      <div className="flex flex-col gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm leading-6 text-slate-500">Save your changes before submitting or resubmitting your profile for review.</p><Button type="submit" disabled={isSaving}>{isSaving ? 'Saving profile…' : 'Save placement profile'}</Button></div>
    </form>
  </section>
}

function LoadingState() { return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">Loading your placement profile…</div> }
function Feedback({ type, children }) { const styles = type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'; return <p className={`rounded-xl border px-4 py-3 text-sm font-medium ${styles}`} role={type === 'error' ? 'alert' : 'status'}>{children}</p> }
function ProfileSection({ title, description, children }) { return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="max-w-2xl"><h2 className="text-lg font-bold tracking-tight text-slate-950">{title}</h2><p className="mt-1.5 text-sm leading-6 text-slate-500">{description}</p></div><div className="mt-5">{children}</div></section> }

function CompletionSummary({ percentage, checks }) {
  return <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-baseline justify-between gap-3"><h2 className="text-base font-bold text-slate-950">Profile completion</h2><span className="text-2xl font-bold tracking-tight text-violet-700">{percentage}%</span></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-violet-600 transition-[width]" style={{ width: `${percentage}%` }} /></div><ul className="mt-4 space-y-2.5 text-sm">{checks.map(([key, done]) => <li className="flex items-start gap-2" key={key}><span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>{done ? '✓' : '○'}</span><span className={done ? 'text-slate-700' : 'text-slate-500'}>{completionLabels[key] ?? key}</span></li>)}</ul></aside>
}

function AcademicRecord({ title, value, onChange }) { return <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4"><h3 className="font-bold text-slate-900">{title}</h3><div className="mt-4 grid gap-4 sm:grid-cols-2"><FormField label="Board" value={value.board} onChange={(event) => onChange('board', event.target.value)} /><FormField label="School name" value={value.schoolName} onChange={(event) => onChange('schoolName', event.target.value)} /><FormField label="Passing year" type="number" value={value.passingYear} onChange={(event) => onChange('passingYear', event.target.value)} /><FormField label="Percentage / CGPA" type="number" step="0.01" value={value.score} onChange={(event) => onChange('score', event.target.value)} /></div></section> }

function RepeatableSection({ title, description, items, fields, maxItems, add, onChange }) {
  return <section><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-bold text-slate-900">{title}</h3><p className="mt-1 text-sm text-slate-500">{description}</p></div><Button variant="secondary" disabled={items.length >= maxItems} onClick={add}>Add {title === 'Semester SPI' ? 'semester' : title === 'Projects' ? 'project' : 'group'}</Button></div>{items.length === 0 && <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">No {title.toLowerCase()} added yet.</p>}<div className="mt-4 space-y-3">{items.map((item, index) => <RepeatableRecord key={index} title={title} item={item} fields={fields} index={index} onChange={onChange} items={items} />)}</div></section>
}

function RepeatableRecord({ title, item, fields, index, items, onChange }) {
  const labels = { semester: 'Semester', spi: 'SPI', name: 'Group name', skills: 'Skills (comma-separated)', title: 'Project title', description: 'Description', technologies: 'Technologies / skills', url: 'GitHub or project URL' }
  return <article className="rounded-xl border border-slate-200 bg-slate-50/70 p-4"><div className="mb-4 flex items-center justify-between gap-3"><p className="text-sm font-bold text-slate-700">{title === 'Semester SPI' ? `Semester ${index + 1}` : `${title.slice(0, -1)} ${index + 1}`}</p><Button variant="quiet" className="min-h-0 px-2 py-1 text-rose-700 hover:bg-rose-50" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}>Remove</Button></div><div className="grid gap-4 sm:grid-cols-2">{fields.map((field) => <FormField key={field} label={labels[field]} type={field === 'semester' || field === 'spi' ? 'number' : field === 'url' ? 'url' : 'text'} as={field === 'description' ? 'textarea' : 'input'} className={field === 'description' ? 'sm:col-span-2 min-h-28' : ''} value={item[field] ?? ''} onChange={(event) => onChange(items.map((current, itemIndex) => itemIndex === index ? { ...current, [field]: event.target.value } : current))} />)}</div></article>
}

function DocumentRow({ label, required, file, busy, onUpload, onView, onDownload }) {
  return <div className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-slate-900">{label}</h3>{required ? <span className="text-xs font-bold text-violet-700">Required</span> : <span className="text-xs font-medium text-slate-500">Optional</span>}</div><p className="mt-1 truncate text-sm text-slate-500">{file?.originalName ?? (required ? 'No PDF uploaded' : 'Not uploaded (optional)')}</p></div><div className="flex flex-wrap items-center gap-2"><label className={`inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 ${busy ? 'cursor-wait opacity-70' : 'cursor-pointer hover:bg-slate-50'}`}><span>{busy ? 'Uploading…' : file ? 'Replace PDF' : 'Upload PDF'}</span><input className="sr-only" type="file" accept="application/pdf,.pdf" disabled={busy} onChange={(event) => onUpload(event.target.files?.[0])} /></label>{file && <><Button variant="secondary" disabled={busy} onClick={onView}>View</Button><Button variant="secondary" disabled={busy} onClick={onDownload}>Download</Button></>}</div></div>
}

function CodingProfiles({ items, onChange }) {
  return <section><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-bold text-slate-900">Coding profiles</h3><p className="mt-1 text-sm text-slate-500">Add up to five optional competitive-programming or coding-platform profiles.</p></div><Button variant="secondary" disabled={items.length >= 5} onClick={() => onChange([...items, { platform: '', url: '' }])}>Add profile</Button></div>{items.length === 0 ? <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">No coding profiles added.</p> : <div className="mt-4 space-y-3">{items.map((item, index) => <article className="rounded-xl border border-slate-200 bg-slate-50/70 p-4" key={index}><div className="mb-4 flex items-center justify-between gap-3"><p className="text-sm font-bold text-slate-700">Coding profile {index + 1}</p><Button variant="quiet" className="min-h-0 px-2 py-1 text-rose-700 hover:bg-rose-50" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}>Remove</Button></div><div className="grid gap-4 sm:grid-cols-2"><FormField label="Platform name" placeholder="e.g. LeetCode" value={item.platform} onChange={(event) => onChange(items.map((current, itemIndex) => itemIndex === index ? { ...current, platform: event.target.value } : current))} /><FormField label="Profile URL" type="url" placeholder="https://…" value={item.url} onChange={(event) => onChange(items.map((current, itemIndex) => itemIndex === index ? { ...current, url: event.target.value } : current))} /></div></article>)}</div>}</section>
}
