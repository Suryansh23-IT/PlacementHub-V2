import { createHash } from 'node:crypto'
import { PROFESSIONAL_ACHIEVEMENT_TERMS } from '../../config/ai-scoring.js'

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}
export const fingerprint = value => createHash('sha256').update(canonicalJson(value)).digest('hex')

// Projection is deliberately narrower than either the Main Profile or recruiter DTO.
// No identifiers, document metadata, URLs, academics or SocialProfile are forwarded.
export function safeProfessionalText(value, max = 400) {
  if (typeof value !== 'string') return ''
  return value.replace(/https?:\/\/\S+/gi, '[link]').replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[contact]')
    .replace(/(?:\+?\d[\d ().-]{7,}\d)/g, '[contact]').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max)
}
const text = safeProfessionalText
function tags(values, max = 40) {
  return [...new Set((Array.isArray(values) ? values : []).map(value => text(value, 80).toLowerCase()).filter(Boolean))].sort().slice(0, max)
}
function list(values, project) {
  return (Array.isArray(values) ? values : []).slice(0, 20).map(project)
    .filter(value => Object.values(value).some(item => Array.isArray(item) ? item.length : item))
    .sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)))
}

export function buildSafeContext({ profile = {}, drive = {} } = {}, { kind = 'professional', resumeDependent = false } = {}) {
  if (!['professional', 'match'].includes(kind)) throw new TypeError('Unsupported foundation context kind.')
  const evidence = []
  const add = (type, data) => { if (canonicalJson(data) !== '{}') evidence.push({ id: `${type}:${fingerprint(data).slice(0, 24)}`, type, data }) }
  const skills = tags([...(Array.isArray(profile.skills) ? profile.skills : []), ...(Array.isArray(profile.skillGroups) ? profile.skillGroups : []).flatMap(group => Array.isArray(group?.skills) ? group.skills : [])])
  for (const skill of skills) add('skill', { skill })
  for (const project of list(profile.projects, value => ({ title: text(value?.title, 120), description: text(value?.description, 600), technologies: tags(value?.technologies) }))) add('project', project)
  for (const experience of list(profile.internships, value => ({ role: text(value?.role, 120), description: text(value?.description, 600), skills: tags(value?.skills) }))) add('experience', experience)
  for (const credential of list(profile.certifications, value => ({ title: text(value?.title, 160), issuer: text(value?.issuer, 160) }))) add('certification', credential)
  const professionalPresence = ['linkedin', 'github', 'portfolio'].filter(key => {
    try { const url = new URL(profile.professionalLinks?.[key]); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password } catch { return false }
  })
  const context = {
    kind, targetRole: text(profile.targetRole, 120), careerInterests: tags(profile.careerInterests, 10),
    evidence: [...new Map(evidence.map(entry => [entry.id, entry])).values()].sort((a, b) => a.id.localeCompare(b.id)),
  }
  if (kind === 'professional') {
    for (const achievement of list(profile.achievements, value => ({ title: text(value?.title, 160), description: text(value?.description, 400) }))) {
      if (PROFESSIONAL_ACHIEVEMENT_TERMS.some(term => `${achievement.title} ${achievement.description}`.toLowerCase().includes(term))) add('achievement', achievement)
    }
    context.evidence = [...new Map(evidence.map(entry => [entry.id, entry])).values()].sort((a, b) => a.id.localeCompare(b.id))
    const codingPresence = tags((profile.codingProfiles ?? []).filter(value => {
      try { const url = new URL(value.url); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password } catch { return false }
    }).map(value => value.platform), 10)
    Object.assign(context, { professionalHeadline: text(profile.professionalHeadline, 160), about: text(profile.about, 800), professionalPresence, codingPresence, resumeAvailable: Boolean(profile.resume) })
  }
  if (kind === 'match') context.drive = { title: text(drive.role?.title, 160), domain: text(drive.role?.domain, 100), description: text(drive.role?.description, 1000), requiredSkills: tags(drive.role?.requiredSkills), preferredSkills: tags(drive.role?.preferredSkills) }
  // Revision is fingerprint-only: never included in provider context or cached output.
  const resume = profile.resume
  const resumeRevision = resumeDependent ? fingerprint(resume ? { uploadedAt: resume.uploadedAt instanceof Date ? resume.uploadedAt.toISOString() : resume.uploadedAt, storagePath: resume.storagePath, size: resume.size } : null) : undefined
  return { context, resumeRevision }
}
