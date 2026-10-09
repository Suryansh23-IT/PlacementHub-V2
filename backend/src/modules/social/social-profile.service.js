import path from 'node:path'
import { env } from '../../config/env.js'
import { SocialProfile } from './social-profile.model.js'
import { socialProfileSchemas } from './social-profile.validation.js'
import { storeImage, removeImage, imagePath } from './social.media.js'
import { AppError } from '../../errors/app-error.js'
import { User } from '../auth/auth.model.js'
import { StudentProfile } from '../students/student.model.js'
import { Company } from '../companies/company.model.js'
import { InstitutionProfile } from '../institution/institution.model.js'

const missing = () => new AppError('Profile was not found.', { statusCode: 404, errorCode: 'NOT_FOUND' })
export const safeUrl = value => { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined } catch { return undefined } }
const studentFields = 'branch graduationYear professionalHeadline about softSkills skills skillGroups targetRole careerInterests projects internships certifications achievements extracurriculars leadership professionalLinks codingProfiles'
const read = (model, query, fields) => model.findOne(query).select(fields).lean()
async function identity(id, deps) {
  const user = await read(deps.userModel ?? User, { _id: id, isActive: true }, '_id name role')
  if (!user || !['student', 'company', 'placement_admin'].includes(user.role)) throw missing()
  return user
}
function studentIdentity(user, p = {}) {
  return { userId: String(user._id), role: 'student', name: user.name, label: 'Student', branch: p.branch, graduationYear: p.graduationYear, headline: p.professionalHeadline || p.targetRole || (p.branch ? `${p.branch} student` : 'Student'), about: p.about || '', skills: [...new Set([...(p.skills ?? []), ...(p.skillGroups ?? []).flatMap(g => g.skills ?? [])])].slice(0, 6) }
}
async function getBaseSocialProfile(viewer, id, deps = {}) {
  const user = await identity(id, deps)
  if (user.role === 'student') {
    const p = await read(deps.profileModel ?? StudentProfile, { userId: id }, 'branch graduationYear professionalHeadline about skills skillGroups targetRole softSkills professionalLinks')
    return { ...studentIdentity(user, p ?? {}), about: (p?.about || '').slice(0, 320), softSkills: p?.softSkills || [], links: Object.fromEntries(['linkedin', 'github', 'portfolio'].map(key => [key, safeUrl(p?.professionalLinks?.[key])]).filter(([, value]) => value)), canViewMainProfile: ['company', 'placement_admin'].includes(viewer.role) }
  }
  if (user.role === 'company') {
    const p = await read(deps.companyModel ?? Company, { userId: id }, 'companyName industry location description website')
    return { userId: String(user._id), role: user.role, label: 'Company', name: p?.companyName || user.name, industry: p?.industry, location: p?.location, about: (p?.description || '').slice(0, 500), website: safeUrl(p?.website), canViewMainProfile: false }
  }
  const institution = await read(deps.institutionModel ?? InstitutionProfile, { singletonKey: 'placementhub-v2' }, 'collegeName location')
  return { userId: String(user._id), role: user.role, label: 'Official', name: 'Placement Administration', institutionName: institution?.collegeName || 'Apex Institute of Technology', location: institution?.location, headline: 'Training & Placement Cell', about: 'Supporting student preparation and professional opportunities through the college placement office.', canViewMainProfile: false }
}
const project = p => ({ title: p.title, description: p.description, technologies: p.technologies ?? [], url: safeUrl(p.url) })
const activity = p => ({ title: p.title, organization: p.organization, role: p.role, description: p.description })
export async function getStudentMainProfile(viewer, id, deps = {}) {
  if (!['company', 'placement_admin'].includes(viewer.role)) throw new AppError('Only Company and Placement Admin may view professional profiles.', { statusCode: 403, errorCode: 'FORBIDDEN' })
  const user = await identity(id, deps)
  if (user.role !== 'student') throw missing()
  const p = await read(deps.profileModel ?? StudentProfile, { userId: id }, studentFields)
  if (!p) throw missing()
  return { ...studentIdentity(user, p), about: p.about || '', skills: p.skills ?? [], skillGroups: (p.skillGroups ?? []).map(g => ({ name: g.name, skills: g.skills ?? [] })), softSkills: p.softSkills ?? [], targetRole: p.targetRole, careerInterests: p.careerInterests ?? [],
    projects: (p.projects ?? []).map(project), internships: (p.internships ?? []).map(x => ({ organization: x.organization, role: x.role, employmentType: x.employmentType, startDate: x.startDate, endDate: x.endDate, description: x.description, skills: x.skills ?? [], url: safeUrl(x.url) })),
    certifications: (p.certifications ?? []).map(x => ({ title: x.title, issuer: x.issuer, issuedOn: x.issuedOn, credentialUrl: safeUrl(x.credentialUrl) })), achievements: (p.achievements ?? []).map(x => ({ title: x.title, issuer: x.issuer, awardedOn: x.awardedOn, description: x.description })), extracurriculars: (p.extracurriculars ?? []).map(activity), leadership: (p.leadership ?? []).map(activity),
    professionalLinks: Object.fromEntries(['linkedin', 'github', 'portfolio'].map(key => [key, safeUrl(p.professionalLinks?.[key])]).filter(([, url]) => url)), codingProfiles: (p.codingProfiles ?? []).map(x => ({ platform: x.platform, url: safeUrl(x.url) })).filter(x => x.url) }
}

const avatarDirectory = path.join(env.SOCIAL_UPLOAD_DIR, 'profile-avatars')
const savedFields = 'userId role headline bio hobbies interests softSkills personalityType achievementHighlights clubs extracurriculars volunteering languages currentlyLearning lookingToExplore links companyName industry location website hiringDomains representativeName designation publicEmail publicPhone representativeNote avatar updatedAt'
export async function getSocialProfile(viewer, id, deps = {}) {
  const base = await getBaseSocialProfile(viewer, id, deps)
  const saved = await read(deps.socialProfileModel ?? SocialProfile, { userId: id }, savedFields)
  const fields = socialProfileSchemas[base.role].shape
  const overlay = {}
  for (const key of Object.keys(fields)) if (key !== 'removeImage' && saved?.[key] !== undefined) {
    if (key === 'links') overlay.links = Object.fromEntries(['linkedin','github','portfolio','codingProfile'].map(k => [k, safeUrl(saved.links?.[k])]).filter(([, value]) => value))
    else if (key === 'website') overlay[key] = safeUrl(saved[key]) || ''
    else overlay[key] = saved[key]
  }
  return { ...base, ...overlay, ...(saved?.bio !== undefined ? { about: saved.bio } : {}), ...(base.role === 'company' && saved?.companyName ? { name: saved.companyName } : {}),
    canEdit: viewer.role === 'placement_admin' || String(viewer._id) === String(id), hasAvatar: base.role !== 'placement_admin' && Boolean(saved?.avatar?.filename), avatarVersion: saved?.avatar?.filename ? saved.updatedAt : undefined }
}
export async function authorizeProfileEdit(viewer, id, deps = {}) {
  if (viewer.role !== 'placement_admin' && String(viewer._id) !== String(id)) throw new AppError('You may edit only your own Social Profile.', { statusCode: 403, errorCode: 'FORBIDDEN' })
  return identity(id, deps)
}
export async function updateSocialProfile(viewer, id, rawInput, deps = {}) {
  const target = await authorizeProfileEdit(viewer, id, deps)
  const input = socialProfileSchemas[target.role].parse(rawInput)
  if (target.role === 'placement_admin' && (deps.imageFile || input.removeImage)) throw new AppError('Official profiles use the AIT logo.', { statusCode: 422, errorCode: 'VALIDATION_ERROR' })
  if (deps.imageFile && input.removeImage) throw new AppError('Choose image replacement or removal.', { statusCode: 422, errorCode: 'VALIDATION_ERROR' })
  const model = deps.socialProfileModel ?? SocialProfile
  const old = await read(model, { userId: id }, 'avatar')
  const replacement = await (deps.storeAvatar ?? (file => storeImage(file, avatarDirectory)))(deps.imageFile)
  const { removeImage: removing, ...values } = input
  const update = { $set: { ...values, userId: target._id, role: target.role, ...(replacement ? { avatar: replacement } : {}) }, ...(removing ? { $unset: { avatar: 1 } } : {}) }
  try { await model.findOneAndUpdate({ userId: id }, update, { upsert: true, runValidators: true, returnDocument: 'after' }) }
  catch (error) { if (replacement) await (deps.removeAvatar ?? (image => removeImage(image, avatarDirectory)))(replacement); throw error }
  if (old?.avatar?.filename && (replacement || removing)) await (deps.removeAvatar ?? (image => removeImage(image, avatarDirectory)))(old.avatar)
  return getSocialProfile(viewer, id, deps)
}
export async function getProfileAvatar(id, deps = {}) {
  const user = await identity(id, deps)
  const saved = await read(deps.socialProfileModel ?? SocialProfile, { userId: id }, 'avatar')
  if (user.role === 'placement_admin' || !saved?.avatar?.filename) throw missing()
  return { path: imagePath(saved.avatar, avatarDirectory), mimeType: saved.avatar.mimeType }
}
