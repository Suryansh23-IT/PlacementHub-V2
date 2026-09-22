import { useEffect, useMemo, useState } from 'react'
import { ErrorState } from '../components/feedback/ErrorState.jsx'
import { LoadingState } from '../components/feedback/LoadingState.jsx'
import { Button } from '../components/ui/Button.jsx'
import { FormField } from '../components/ui/FormField.jsx'
import { PageHeader } from '../components/ui/PageHeader.jsx'
import { StatusBadge } from '../components/ui/StatusBadge.jsx'
import { useAuth } from '../features/auth/useAuth.js'
import { studentProfileFormSchema } from '../features/student/student.schemas.js'
import { downloadMyResume, getMyStudentProfile, resubmitMyProfileForVerification, updateMyStudentProfile, uploadMyResume } from '../services/student.service.js'

const emptyProfile = { branch: '', graduationYear: '', cgpa: '', activeBacklogs: 0, skills: [], projects: [] }

function formFromProfile(profile) {
  return { ...emptyProfile, ...profile, skillsText: (profile.skills ?? []).join(', '), projects: profile.projects ?? [] }
}

export function StudentProfilePage() {
  const { session } = useAuth()
  const [profile, setProfile] = useState(null)
  const [form, setForm] = useState(emptyProfile)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isResubmitting, setIsResubmitting] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [success, setSuccess] = useState('')

  useEffect(() => {
    getMyStudentProfile(session.accessToken).then(({ data }) => { setProfile(data); setForm(formFromProfile(data)) }).catch((requestError) => setError(requestError.message)).finally(() => setIsLoading(false))
  }, [session.accessToken])

  const verificationMessage = useMemo(() => {
    if (profile?.verificationStatus === 'verified') return 'Your profile is verified. Placement actions that require verification will be available as those modules are released.'
    if (profile?.verificationStatus === 'rejected') return profile.rejectionReason ? `Your profile needs attention: ${profile.rejectionReason}` : 'Your profile was not verified. Contact the placement cell if you need help.'
    return 'Your profile is pending Placement Admin review. You can keep updating it while you wait.'
  }, [profile])

  function change(field, value) { setForm((current) => ({ ...current, [field]: value })) }
  function changeProject(index, field, value) { setForm((current) => ({ ...current, projects: current.projects.map((project, projectIndex) => projectIndex === index ? { ...project, [field]: value } : project) })) }

  async function saveProfile(event) {
    event.preventDefault(); setError(''); setSuccess(''); setFieldErrors({})
    const payload = { ...form, graduationYear: Number(form.graduationYear), cgpa: Number(form.cgpa), activeBacklogs: Number(form.activeBacklogs), skills: form.skillsText.split(',').map((skill) => skill.trim()).filter(Boolean), projects: form.projects.map((project) => ({ ...project, technologies: typeof project.technologies === 'string' ? project.technologies.split(',').map((technology) => technology.trim()).filter(Boolean) : project.technologies })) }
    delete payload.skillsText
    const validation = studentProfileFormSchema.safeParse(payload)
    if (!validation.success) { const nextErrors = {}; validation.error.issues.forEach((issue) => { const field = issue.path[0] ?? 'form'; if (!nextErrors[field]) nextErrors[field] = issue.message }); setFieldErrors(nextErrors); setError('Check the highlighted profile fields and try again.'); return }
    setIsSaving(true)
    try { const { data } = await updateMyStudentProfile(session.accessToken, validation.data); setProfile(data); setForm(formFromProfile(data)); setSuccess('Profile saved successfully.') } catch (requestError) { const serverErrors = requestError.details?.fieldErrors ?? {}; setFieldErrors(serverErrors); setError(requestError.message) } finally { setIsSaving(false) }
  }

  async function uploadResume(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setError(''); setSuccess('')
    if (file.type !== 'application/pdf' || !file.name.toLowerCase().endsWith('.pdf')) { setError('Choose a PDF resume file.'); event.target.value = ''; return }
    if (file.size > 5 * 1024 * 1024) { setError('Resume files must be 5 MB or smaller.'); event.target.value = ''; return }
    setIsUploading(true)
    try { const { data } = await uploadMyResume(session.accessToken, file); setProfile(data); setForm(formFromProfile(data)); setSuccess('Resume uploaded successfully.') } catch (requestError) { setError(requestError.message) } finally { setIsUploading(false); event.target.value = '' }
  }

  async function openResume() {
    setError('')
    try {
      const file = await downloadMyResume(session.accessToken)
      const url = URL.createObjectURL(file)
      const link = document.createElement('a')
      link.href = url
      link.download = profile.resume.originalName
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (requestError) { setError(requestError.message) }
  }

  async function resubmitForVerification() {
    setError(''); setSuccess(''); setIsResubmitting(true)
    try { const { data } = await resubmitMyProfileForVerification(session.accessToken); setProfile(data); setForm(formFromProfile(data)); setSuccess('Profile resubmitted for verification.') } catch (requestError) { setError(requestError.message) } finally { setIsResubmitting(false) }
  }

  if (isLoading) return <LoadingState message="Loading your student profile…" />
  if (!profile) return <ErrorState message={error || 'Your student profile could not be loaded.'} />

  return <section className="space-y-8"><PageHeader eyebrow="Student profile" title="Build your placement profile" description="Keep your academic details, skills, projects, and resume ready for Placement Admin review." action={<StatusBadge status={profile.verificationStatus} />} />{error && <ErrorState message={error} />}{success && <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800" role="status">{success}</p>}<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><h2 className="text-lg font-bold text-slate-950">Verification status</h2><p className="mt-2 leading-6 text-slate-600">{verificationMessage}</p>{profile.verificationStatus === 'rejected' && <div className="mt-4"><Button onClick={resubmitForVerification} disabled={isResubmitting}>{isResubmitting ? 'Resubmitting…' : 'Resubmit for verification'}</Button></div>}</section><form className="space-y-8" onSubmit={saveProfile}><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><h2 className="text-xl font-bold text-slate-950">Academic details</h2><div className="mt-5 grid gap-4 sm:grid-cols-2"><FormField label="Branch" error={fieldErrors.branch} value={form.branch} onChange={(event) => change('branch', event.target.value)} placeholder="e.g. Computer Science" required /><FormField label="Graduation year" error={fieldErrors.graduationYear} type="number" min="2000" max="2100" value={form.graduationYear} onChange={(event) => change('graduationYear', event.target.value)} required /><FormField label="CGPA" error={fieldErrors.cgpa} type="number" min="0" max="10" step="0.01" value={form.cgpa} onChange={(event) => change('cgpa', event.target.value)} required /><FormField label="Active backlogs" error={fieldErrors.activeBacklogs} type="number" min="0" max="100" value={form.activeBacklogs} onChange={(event) => change('activeBacklogs', event.target.value)} required /></div></section><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><h2 className="text-xl font-bold text-slate-950">Skills</h2><p className="mt-1 text-sm leading-6 text-slate-600">Separate skills with commas. Add only skills you can confidently discuss.</p><div className="mt-4"><FormField label="Your skills" error={fieldErrors.skills} value={form.skillsText ?? ''} onChange={(event) => change('skillsText', event.target.value)} placeholder="React, JavaScript, MongoDB" /></div></section><ProjectsEditor projects={form.projects} error={fieldErrors.projects} onChange={changeProject} onAdd={() => change('projects', [...form.projects, { title: '', description: '', technologies: '', url: '' }])} onRemove={(index) => change('projects', form.projects.filter((_, projectIndex) => projectIndex !== index))} /><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><h2 className="text-xl font-bold text-slate-950">Resume</h2><p className="mt-1 text-sm leading-6 text-slate-600">Upload one PDF resume up to 5 MB. A new file safely replaces the previous one.</p>{profile.resume && <div className="mt-4 flex flex-col gap-3 rounded-xl bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-slate-700"><span className="font-semibold">Current file:</span> {profile.resume.originalName}</p><Button variant="secondary" className="w-full sm:w-auto" onClick={openResume}>Download resume</Button></div>}<label className="mt-4 flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-violet-300 bg-violet-50 px-4 py-4 text-sm font-bold text-violet-800 hover:bg-violet-100"><input className="sr-only" type="file" accept="application/pdf,.pdf" onChange={uploadResume} disabled={isUploading} />{isUploading ? 'Uploading resume…' : 'Choose PDF resume'}</label></section><div className="flex justify-end"><Button type="submit" className="w-full sm:w-auto" disabled={isSaving}>{isSaving ? 'Saving profile…' : 'Save profile'}</Button></div></form></section>
}

function ProjectsEditor({ projects, error, onChange, onAdd, onRemove }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex items-center justify-between gap-4"><div><h2 className="text-xl font-bold text-slate-950">Projects</h2><p className="mt-1 text-sm leading-6 text-slate-600">Show relevant work with a concise description.</p></div><Button variant="secondary" onClick={onAdd}>Add project</Button></div>{error && <p className="mt-3 text-sm font-medium text-rose-700" role="alert">{error}</p>}{projects.length === 0 ? <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No projects added yet.</p> : <div className="mt-5 space-y-5">{projects.map((project, index) => <div className="rounded-xl border border-slate-200 p-4" key={project._id ?? index}><div className="grid gap-4 sm:grid-cols-2"><FormField label="Project title" value={project.title} onChange={(event) => onChange(index, 'title', event.target.value)} required /><FormField label="Project URL (optional)" type="url" value={project.url ?? ''} onChange={(event) => onChange(index, 'url', event.target.value)} placeholder="https://…" /><div className="sm:col-span-2"><FormField as="textarea" rows="3" label="Description" value={project.description} onChange={(event) => onChange(index, 'description', event.target.value)} required /></div><div className="sm:col-span-2"><FormField label="Technologies" value={Array.isArray(project.technologies) ? project.technologies.join(', ') : project.technologies} onChange={(event) => onChange(index, 'technologies', event.target.value)} placeholder="React, Node.js" /></div></div><Button variant="quiet" className="mt-3 text-rose-700 hover:bg-rose-50" onClick={() => onRemove(index)}>Remove project</Button></div>)}</div>}</section>
}
