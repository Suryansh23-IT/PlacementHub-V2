import { readFile, unlink } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import { AppError } from '../../errors/app-error.js'
import { USER_ROLES } from '../auth/auth.constants.js'
import { User } from '../auth/auth.model.js'
import { StudentProfile } from './student.model.js'
import { getInstitutionProfile } from '../institution/institution.service.js'
import { PlacementRecord } from '../placements/placement-record.model.js'
import { Application } from '../applications/application.model.js'
import { PlacementDrive } from '../placement-drives/placement-drive.model.js'
import { Company } from '../companies/company.model.js'
import { isCollegePlacementEligible, PLACEMENT_EQUIVALENT_OUTCOMES } from '../analytics/analytics.service.js'
import { createPlacementWorkbookExport } from '../recruitment/recruitment-export.service.js'
import { createNotifications } from '../notifications/notification.service.js'
import { Notification } from '../notifications/notification.model.js'
import { randomUUID } from 'node:crypto'

const VERIFICATION_STATUS = Object.freeze({ PENDING: 'pending', VERIFIED: 'verified', REJECTED: 'rejected' })

export async function ensureStudentProfile(userId, { profileModel = StudentProfile } = {}) {
  return profileModel.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  )
}

export async function getStudentProfile(userId, dependencies = {}) {
  return ensureStudentProfile(userId, dependencies)
}

export async function getStudentIdentityContext(user, { institutionService = getInstitutionProfile } = {}) {
  const institution = await institutionService()
  return {
    studentName: user.name ?? '',
    institutionName: institution?.collegeName ?? '',
  }
}

export async function updateStudentProfile(userId, input, { profileModel = StudentProfile, institutionService = getInstitutionProfile } = {}) {
  const current = await ensureStudentProfile(userId, { profileModel })
  const institution = await institutionService()
  const branches = institution.branches ?? []
  if (!branches.includes(input.branch)) throw new AppError('Select a branch configured by the Placement Admin.', { statusCode: 422, errorCode: 'VALIDATION_ERROR' })
  const material = hasVerificationCriticalChanges(current, input)
  // PATCH validation intentionally excludes document metadata. Merge the existing
  // optional marksheets so an ordinary profile save cannot replace their subdocuments.
  const update = {
    ...input,
    class10: mergeAcademicRecord(current.class10, input.class10),
    class12: mergeAcademicRecord(current.class12, input.class12),
  }
  if (current.verificationStatus === VERIFICATION_STATUS.VERIFIED && material) Object.assign(update, { verificationStatus: VERIFICATION_STATUS.PENDING, reviewedBy: undefined, reviewedAt: undefined, rejectionReason: undefined })
  return profileModel.findOneAndUpdate({ userId }, { $set: update }, { new: true, runValidators: true })
}

export async function saveAcademicMarksheet(userId, type, file, { profileModel = StudentProfile } = {}) {
  if (!file) throw new AppError('Attach a PDF document to upload.', { statusCode: 422, errorCode: 'VALIDATION_ERROR' })
  const contents = await readFile(file.path).catch(() => null)
  if (!contents?.subarray(0, 5).equals(Buffer.from('%PDF-'))) { await unlink(file.path).catch(() => undefined); throw new AppError('The uploaded file is not a valid PDF document.', { statusCode: 422, errorCode: 'VALIDATION_ERROR' }) }
  const profile = await ensureStudentProfile(userId, { profileModel })
  const document = { originalName: file.originalname, storagePath: file.path, mimeType: file.mimetype, size: file.size, uploadedAt: new Date() }
  const previous = type === 'collegeResult' ? profile.collegeResult?.storagePath : profile[type]?.marksheet?.storagePath
  if (type === 'collegeResult') {
    profile.collegeResult = document
    revokeVerificationForMaterialChange(profile)
  } else {
    profile[type] ??= {}
    profile[type].marksheet = document
  }
  try { await profile.save() } catch (error) { await unlink(file.path).catch(() => undefined); throw error }
  if (previous && previous !== file.path) await unlink(previous).catch(() => undefined)
  return profile
}
export async function getAcademicMarksheet(userId, type, dependencies = {}) { const profile = await getStudentProfile(userId, dependencies); const document = type === 'collegeResult' ? profile.collegeResult : profile[type]?.marksheet; if (!document) throw new AppError('No document has been uploaded yet.', { statusCode: 404, errorCode: 'NOT_FOUND' }); return document }

export async function getStudentDocumentForAdmin(studentId, type, { userModel = User, profileModel = StudentProfile } = {}) {
  const student = await userModel.findOne({ _id: studentId, role: USER_ROLES.STUDENT }).select('_id')
  if (!student) throw new AppError('Student account was not found.', { statusCode: 404, errorCode: 'NOT_FOUND' })
  if (type === 'resume') return getResumeForDownload(student._id, { profileModel })
  return getAcademicMarksheet(student._id, type, { profileModel })
}

export async function saveResume(userId, file, { profileModel = StudentProfile } = {}) {
  if (!file) {
    throw new AppError('Attach a PDF resume to upload.', { statusCode: 422, errorCode: 'VALIDATION_ERROR' })
  }

  const contents = await readFile(file.path).catch(() => null)
  if (!contents?.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    await unlink(file.path).catch(() => undefined)
    throw new AppError('The uploaded file is not a valid PDF resume.', { statusCode: 422, errorCode: 'VALIDATION_ERROR' })
  }

  const profile = await ensureStudentProfile(userId, { profileModel })
  const previousResume = profile.resume
  const previousPath = previousResume?.storagePath
  profile.resume = {
    originalName: file.originalname,
    storagePath: file.path,
    mimeType: file.mimetype,
    size: file.size,
    uploadedAt: new Date(),
  }
  // Resume improvements do not change the academic verification decision.
  try {
    await profile.save()
  } catch (error) {
    profile.resume = previousResume
    await unlink(file.path).catch(() => undefined)
    throw error
  }

  if (previousPath && previousPath !== file.path) {
    await unlink(previousPath).catch(() => undefined)
  }
  return profile
}

export async function getResumeForDownload(userId, dependencies = {}) {
  const profile = await getStudentProfile(userId, dependencies)
  if (!profile.resume) {
    throw new AppError('No resume has been uploaded yet.', { statusCode: 404, errorCode: 'NOT_FOUND' })
  }
  return profile.resume
}

export async function listStudentsForReview({ userModel = User, profileModel = StudentProfile } = {}) {
  const students = await userModel.find({ role: USER_ROLES.STUDENT }).select('_id name email createdAt').lean()
  const profiles = await profileModel.find({ userId: { $in: students.map((student) => student._id) } }).lean()
  const profileByUserId = new Map(profiles.map((profile) => [profile.userId.toString(), profile]))

  return Promise.all(students.map(async (student) => {
    const profile = profileByUserId.get(student._id.toString()) ?? await ensureStudentProfile(student._id, { profileModel })
    return { ...student, profile }
  }))
}

export async function exploreStudents(filters, { profileModel = StudentProfile, recordModel = PlacementRecord, applicationModel = Application, driveModel = PlacementDrive, companyModel = Company, userModel = User, institutionService = getInstitutionProfile } = {}) {
  const [institution, users, profiles, confirmedRecords, pendingRecords, applications, drives, companies] = await Promise.all([institutionService(), userModel.find({ role: USER_ROLES.STUDENT }).select('_id name email').lean(), profileModel.find({}).lean(), recordModel.find({ verificationState: 'confirmed' }).lean(), recordModel.find({ verificationState: 'pending_admin_verification' }).lean(), applicationModel.find({}).lean(), driveModel.find({}).select('_id companyId driveCode role').lean(), companyModel.find({}).select('_id companyName').lean()])
  const records = [...confirmedRecords, ...pendingRecords]; const userById = new Map(users.map(user => [String(user._id), user])); const recordsByStudent = new Map(); for (const record of records) { const key = String(record.studentId); recordsByStudent.set(key, [...(recordsByStudent.get(key) ?? []), record]) }
  const driveById = new Map(drives.map(drive => [String(drive._id), drive])); const companyById = new Map(companies.map(company => [String(company._id), company])); const appByStudent = new Map(); for (const app of applications) { const key = String(app.studentId); if (!appByStudent.has(key) || app.updatedAt > appByStudent.get(key).updatedAt) appByStudent.set(key, app) }
  let rows = profiles.map(profile => { const student = userById.get(String(profile.userId)); const studentRecords = recordsByStudent.get(String(profile.userId)) ?? []; const placedRecord = studentRecords.find(record => record.verificationState === 'confirmed' && PLACEMENT_EQUIVALENT_OUTCOMES.includes(record.outcomeType)); const pendingRecord = studentRecords.find(record => record.verificationState === 'pending_admin_verification'); const record = placedRecord ?? pendingRecord; const app = appByStudent.get(String(profile.userId)); const drive = driveById.get(String(app?.placementDriveId)); const confirmedCompany = companyById.get(String(record?.companyId)); const eligible = isCollegePlacementEligible(profile, institution?.collegeEligibility); const placed = Boolean(placedRecord); const offerReceived = studentRecords.length > 0; const placementStatus = placed ? `placed_${placedRecord.outcomeType}` : pendingRecord ? 'confirmation_pending' : offerReceived ? 'offer_received' : eligible ? 'unplaced_eligible' : 'ineligible'; return { id: String(profile.userId), name: student?.name ?? '', email: student?.email ?? '', rollNumber: profile.rollNumber ?? '', branch: profile.branch ?? '', graduationYear: profile.graduationYear, cgpa: profile.cgpa, activeBacklogs: profile.activeBacklogs, verificationStatus: profile.verificationStatus, collegeEligibility: eligible ? 'eligible' : 'ineligible', placementStatus, offerStatus: offerReceived ? 'offer_received' : '', confirmationStatus: pendingRecord ? 'pending_admin_verification' : record ? 'confirmed' : '', confirmedOutcome: placedRecord?.outcomeType ?? record?.outcomeType ?? null, placementSource: record?.placementSource ?? 'ON_CAMPUS', companyId: record?.companyId ? String(record.companyId) : undefined, companyName: record?.employerName ?? confirmedCompany?.companyName ?? '', driveId: record?.placementDriveId ? String(record.placementDriveId) : app?.placementDriveId ? String(app.placementDriveId) : undefined, driveContext: drive ? `${drive.driveCode ?? 'Drive'}${drive.role?.title ? ` · ${drive.role.title}` : ''}` : '', currentPhase: app?.currentPhase, applicationStatus: app?.currentStatus, activityAt: app?.updatedAt ?? profile.updatedAt, placementRecords: studentRecords } })
  const text = filters.search?.toLowerCase(); if (text) rows = rows.filter(row => [row.name, row.email, row.rollNumber].some(value => value.toLowerCase().includes(text)))
  for (const [key, value] of Object.entries({ branch: filters.branch, graduationYear: filters.graduationYear ?? filters.batch, verificationStatus: filters.verificationStatus, companyId: filters.company, driveId: filters.drive, currentPhase: filters.phase, applicationStatus: filters.applicationStatus })) if (value != null && value !== '') rows = rows.filter(row => String(row[key]) === String(value))
  if (filters.minCpi != null) rows = rows.filter(row => row.cgpa >= filters.minCpi); if (filters.maxCpi != null) rows = rows.filter(row => row.cgpa <= filters.maxCpi); if (filters.backlog === 'zero') rows = rows.filter(row => row.activeBacklogs === 0); if (filters.backlog === 'has_backlog') rows = rows.filter(row => row.activeBacklogs > 0)
  if (filters.collegeEligibility) rows = rows.filter(row => row.collegeEligibility === filters.collegeEligibility); if (filters.placementStatus === 'placed') rows = rows.filter(row => row.placementStatus.startsWith('placed_')); else if (filters.placementStatus === 'offer_received') rows = rows.filter(row => row.offerStatus === 'offer_received'); else if (filters.placementStatus === 'confirmation_pending') rows = rows.filter(row => row.confirmationStatus === 'pending_admin_verification'); else if (filters.placementStatus === 'unplaced') rows = rows.filter(row => !row.placementStatus.startsWith('placed_') && row.placementStatus !== 'confirmation_pending' && row.placementStatus !== 'offer_received'); else if (filters.placementStatus) rows = rows.filter(row => row.placementStatus === filters.placementStatus); if (filters.outcomeType) rows = rows.filter(row => row.placementRecords.some(record => record.outcomeType === filters.outcomeType)); if (filters.placementSource) rows = rows.filter(row => row.placementRecords.some(record => record.placementSource === filters.placementSource)); rows = rows.map(({ placementRecords, ...row }) => row)
  const direction = filters.sortOrder === 'desc' ? -1 : 1; const field = { cgpa: 'cgpa', branch: 'branch', activity: 'activityAt', placement_status: 'placementStatus' }[filters.sortBy] ?? 'name'; rows.sort((left, right) => (String(left[field] ?? '').localeCompare(String(right[field] ?? '')) * direction) || left.id.localeCompare(right.id))
  const totalRecords = rows.length; const page = filters.page ?? 1; const limit = filters.limit ?? 50; const start = (page - 1) * limit; const groupSummary = filters.groupBy === 'branch' ? Object.values(rows.reduce((result, row) => { const item = result[row.branch] ?? { branch: row.branch, count: 0, placed: 0, unplacedEligible: 0, ineligible: 0 }; item.count += 1; if (row.placementStatus.startsWith('placed_')) item.placed += 1; if (row.placementStatus === 'unplaced_eligible') item.unplacedEligible += 1; if (row.collegeEligibility === 'ineligible') item.ineligible += 1; result[row.branch] = item; return result }, {})).sort((left, right) => left.branch.localeCompare(right.branch)) : undefined; return { records: rows.slice(start, start + limit), page, limit, totalRecords, totalPages: Math.max(1, Math.ceil(totalRecords / limit)), appliedFilters: filters, groupSummary }
}

export async function resolveStudentExplorerRecipients(input, dependencies = {}) {
  const filters = { ...(input.filters ?? {}), page: 1, limit: 100 }
  if (input.mode !== 'selected') {
    const rows = await exploreAllStudents(filters, dependencies)
    return { rows, recipientCount: rows.length, filters }
  }
  const wanted = new Set(input.selectedStudentIds ?? [])
  // Selected exports/notifications must use the same projected cohort as the
  // Explorer. Resolve server-side and reject stale/foreign IDs rather than
  // accepting client-provided recipients.
  const all = await exploreAllStudents(filters, dependencies)
  const rows = all.filter(row => wanted.has(row.id))
  if (rows.length !== wanted.size) throw new AppError('One or more selected students are no longer available in this Explorer scope.', { statusCode: 422, errorCode: 'VALIDATION_ERROR' })
  return { rows, recipientCount: rows.length, filters }
}

async function exploreAllStudents(filters, dependencies) {
  // This is a deliberate server-only exception for the single-college M8C
  // action paths. It resolves one bounded cohort once (rather than issuing a
  // query per page), while the normal Explorer API still returns only a page.
  return (await exploreStudents({ ...filters, page: 1, limit: 10000 }, dependencies)).records
}

export async function exportStudentExplorer(input, dependencies = {}) {
  const resolved = await resolveStudentExplorerRecipients(input, dependencies)
  const rows = input.mode === 'current_view'
    ? (await exploreStudents(input.filters ?? {}, dependencies)).records
    : input.mode === 'all_matching' ? await exploreAllStudents({ ...(input.filters ?? {}), page: 1, limit: 100 }, dependencies) : resolved.rows
  const columns = [
    { header: 'Name', key: 'name', width: 26 }, { header: 'Roll Number', key: 'rollNumber', width: 18 }, { header: 'Email', key: 'email', width: 30 }, { header: 'Branch', key: 'branch', width: 18 }, { header: 'Graduation Year', key: 'graduationYear', width: 16 }, { header: 'CPI', key: 'cgpa', width: 10 }, { header: 'Active Backlog', key: 'activeBacklogs', width: 16 }, { header: 'College Eligibility', key: 'collegeEligibility', width: 20 }, { header: 'Verification Status', key: 'verificationStatus', width: 20 }, { header: 'Placement Status', key: 'placementStatus', width: 28 }, { header: 'Offer Status', key: 'offerStatus', width: 24 }, { header: 'Confirmation Status', key: 'confirmationStatus', width: 26 }, { header: 'Placement Source', key: 'placementSource', width: 20 }, { header: 'Confirmed Company', key: 'companyId', width: 24 }, { header: 'Outcome Type', key: 'confirmedOutcome', width: 22 }, { header: 'Current Drive', key: 'driveId', width: 24 }, { header: 'Current Phase', key: 'currentPhase', width: 16 }, { header: 'Application Status', key: 'applicationStatus', width: 28 },
  ]
  const exportRows = rows.map(row => [row.name, row.rollNumber, row.email, row.branch, row.graduationYear ?? '', row.cgpa ?? '', row.activeBacklogs ?? '', row.collegeEligibility, row.verificationStatus, row.placementStatus, row.offerStatus ?? '', row.confirmationStatus ?? '', row.placementSource ?? '', row.companyName ?? '', row.confirmedOutcome ?? '', row.driveContext ?? '', row.currentPhase ?? '', row.applicationStatus ?? ''])
  const filterSummary = Object.entries(input.filters ?? {}).filter(([key, value]) => value !== '' && !['page', 'limit'].includes(key)).map(([key, value]) => `${key}: ${value}`).join(', ')
  return { buffer: await createPlacementWorkbookExport({ title: 'Student Explorer', columns, rows: exportRows, sheetName: 'Students', filterSummary }), filename: `placementhub-students-${input.mode}.xlsx`, rowCount: exportRows.length }
}

export async function previewStudentExplorerNotification(input, dependencies = {}) {
  const resolved = input.mode === 'selected'
    ? await resolveStudentExplorerRecipients(input, dependencies)
    : { rows: await exploreAllStudents({ ...(input.filters ?? {}), page: 1, limit: 100 }, dependencies) }
  return { recipientCount: resolved.rows.length }
}

export async function sendStudentExplorerNotification(adminId, input, { notificationModel = Notification, ...dependencies } = {}) {
  const resolved = input.mode === 'selected'
    ? await resolveStudentExplorerRecipients(input, dependencies)
    : { rows: await exploreAllStudents({ ...(input.filters ?? {}), page: 1, limit: 100 }, dependencies) }
  const notificationBatchId = input.requestId ?? randomUUID()
  const notifications = resolved.rows.map(row => ({ recipientId: row.id, senderId: adminId, notificationBatchId, idempotencyKey: input.requestId, category: 'manual_placement_message', type: 'admin_to_students', source: 'college', title: input.title, message: input.message, context: { action: 'view_application', audience: 'student' } }))
  if (!notifications.length) return { notificationsCreated: 0, recipientCount: 0, alreadySent: false, notificationBatchId }
  try {
    const created = await createNotifications(notifications, { notificationModel })
    return { notificationsCreated: created.length, recipientCount: notifications.length, alreadySent: false, notificationBatchId }
  } catch (error) {
    if (error?.code !== 11000 || !input.requestId) throw error
    const prior = await notificationModel.find({ senderId: adminId, idempotencyKey: input.requestId }).select('recipientId').lean()
    return { notificationsCreated: prior.length, recipientCount: prior.length, alreadySent: true, notificationBatchId }
  }
}

export async function reviewStudentVerification(studentId, reviewerId, input, { userModel = User, profileModel = StudentProfile } = {}) {
  const student = await userModel.findOne({ _id: studentId, role: USER_ROLES.STUDENT }).select('_id')
  if (!student) {
    throw new AppError('Student account was not found.', { statusCode: 404, errorCode: 'NOT_FOUND' })
  }

  const profile = await ensureStudentProfile(student._id, { profileModel })
  if (profile.verificationStatus !== VERIFICATION_STATUS.PENDING) {
    throw new AppError('Only pending student profiles can be reviewed.', { statusCode: 409, errorCode: 'CONFLICT' })
  }

  if (input.status === VERIFICATION_STATUS.VERIFIED) assertProfileReadyForVerification(profile, 'verification')

  profile.verificationStatus = input.status
  profile.reviewedBy = reviewerId
  profile.reviewedAt = new Date()
  profile.rejectionReason = input.status === VERIFICATION_STATUS.REJECTED ? input.rejectionReason : undefined
  await profile.save()
  return profile
}

export async function resubmitStudentVerification(userId, { profileModel = StudentProfile } = {}) {
  const profile = await getStudentProfile(userId, { profileModel })
  if (profile.verificationStatus !== VERIFICATION_STATUS.REJECTED) {
    throw new AppError('Only rejected student profiles can be resubmitted for verification.', { statusCode: 409, errorCode: 'CONFLICT' })
  }
  assertProfileReadyForVerification(profile, 'resubmission')

  profile.verificationStatus = VERIFICATION_STATUS.PENDING
  profile.reviewedBy = undefined
  profile.reviewedAt = undefined
  profile.rejectionReason = undefined
  await profile.save()
  return profile
}

export function getProfileCompletion(profile) {
  const hasAcademicRecord = (record) => Boolean(record?.board && record?.schoolName && record?.passingYear !== undefined && record?.score !== undefined)
  const hasSkillGroup = (group) => Boolean(group?.name && (group.skills ?? []).length)
  const hasProject = (project) => Boolean(project?.title && project?.description)
  const checks = {
    basicDetails: Boolean(profile.phone && profile.rollNumber && profile.branch && profile.graduationYear),
    class10: hasAcademicRecord(profile.class10),
    class12: hasAcademicRecord(profile.class12),
    collegeAcademic: Boolean(profile.cgpa !== undefined && profile.activeBacklogs !== undefined && (profile.semesterSpis ?? []).length),
    skillGroups: Boolean((profile.skillGroups ?? []).length) && (profile.skillGroups ?? []).every(hasSkillGroup),
    projects: Boolean((profile.projects ?? []).length) && (profile.projects ?? []).every(hasProject),
    resume: Boolean(profile.resume),
    collegeResult: Boolean(profile.collegeResult),
  }
  const values = Object.values(checks)
  return { checks, complete: values.every(Boolean), percentage: Math.round((values.filter(Boolean).length / values.length) * 100) }
}

function assertProfileReadyForVerification(profile, action) {
  if (getProfileCompletion(profile).complete) return
  const message = action === 'resubmission'
    ? 'Complete the required profile details and upload a resume and college result before resubmitting.'
    : 'The student must complete the required profile details and upload a resume and college result before verification.'
  throw new AppError(message, { statusCode: 409, errorCode: 'CONFLICT' })
}

const VERIFICATION_CRITICAL_PROFILE_FIELDS = Object.freeze([
  'branch',
  'graduationYear',
  'cgpa',
  'activeBacklogs',
  'class10',
  'class12',
  'semesterSpis',
  'skillGroups',
  'projects',
])

function hasVerificationCriticalChanges(current, input) {
  return VERIFICATION_CRITICAL_PROFILE_FIELDS.some((field) => !isDeepStrictEqual(toComparable(current[field], field), toComparable(input[field], field)))
}

function mergeAcademicRecord(current, input) {
  const marksheet = current?.marksheet?.toObject ? current.marksheet.toObject() : current?.marksheet
  return { ...input, ...(marksheet ? { marksheet } : {}) }
}

function toComparable(value, field) {
  const plainValue = value?.toObject ? value.toObject() : value
  if (field === 'class10' || field === 'class12') {
    const { board, schoolName, passingYear, score } = plainValue ?? {}
    return { board: board ?? null, schoolName: schoolName ?? null, passingYear: passingYear ?? null, score: score ?? null }
  }
  return JSON.parse(JSON.stringify(plainValue ?? null))
}

function revokeVerificationForMaterialChange(profile) {
  if (profile.verificationStatus !== VERIFICATION_STATUS.VERIFIED) return
  profile.verificationStatus = VERIFICATION_STATUS.PENDING
  profile.reviewedBy = undefined
  profile.reviewedAt = undefined
  profile.rejectionReason = undefined
}

export { VERIFICATION_STATUS }
