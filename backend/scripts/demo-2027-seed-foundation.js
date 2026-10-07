import { createHash } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { copyFile, mkdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { CANONICAL_COMPANIES_2027, CANONICAL_DRIVE_PROPOSALS_2027 } from '../data/demo-2027-m9/canonical-companies-drives.js'
import { CANONICAL_COMPANY_DOCUMENTS, CANONICAL_DRIVE_DOCUMENT_MAPPINGS, CANONICAL_STUDENT_RESUME_DOCUMENTS, validateDemo2027DocumentAssets } from '../data/demo-2027-m9/document-assets.js'
import { CANONICAL_STUDENTS_2027, validateCanonicalStudents2027 } from '../data/demo-2027-m9/canonical-students.js'
import { AppError } from '../src/errors/app-error.js'
import { User } from '../src/modules/auth/auth.model.js'
import { Company } from '../src/modules/companies/company.model.js'
import { Notification } from '../src/modules/notifications/notification.model.js'
import { PlacementRecord } from '../src/modules/placements/placement-record.model.js'
import { PlacementDrive } from '../src/modules/placement-drives/placement-drive.model.js'
import { Application } from '../src/modules/applications/application.model.js'
import { RecruiterPlacementPolicy, RecruiterPolicyAcceptance } from '../src/modules/recruiter-policy/recruiter-policy.model.js'
import { StudentPlacementPolicy, StudentPolicyAcceptance } from '../src/modules/student-policy/student-policy.model.js'
import { StudentProfile } from '../src/modules/students/student.model.js'
import { USER_ROLES } from '../src/modules/auth/auth.constants.js'
import { DEMO_2027_SEED_KEY, Demo2027SeedManifest } from './demo-2027-seed-manifest.js'

export const DEMO_2027_DATABASE_NAME = 'placementhub-v2-demo-2027'
export const DEMO_2027_UPLOAD_DIRECTORY_NAME = 'demo-2027-m9'
export { DEMO_2027_SEED_KEY }

export function configuredDatabaseName(mongoUri) {
  let parsed
  try { parsed = new URL(mongoUri) } catch { throw new AppError('MONGO_URI must be a valid MongoDB URL before running a 2027 demo command.', { statusCode: 422, errorCode: 'VALIDATION_ERROR' }) }
  return decodeURIComponent(parsed.pathname).replace(/^\/+|\/+$/g, '')
}

export function assertDemo2027Database(mongoUri) {
  const databaseName = configuredDatabaseName(mongoUri)
  if (databaseName !== DEMO_2027_DATABASE_NAME) {
    throw new AppError(`Refusing 2027 demo operation: MONGO_URI must target exactly ${DEMO_2027_DATABASE_NAME}; received ${databaseName || '(no database name)'}.`, { statusCode: 403, errorCode: 'DEMO_DATABASE_GUARD' })
  }
  return databaseName
}

export function demo2027UploadRoot(resumeUploadDirectory) {
  return path.resolve(resumeUploadDirectory, DEMO_2027_UPLOAD_DIRECTORY_NAME)
}

export function isWithinRoot(target, root) {
  const resolvedRoot = path.resolve(root)
  const resolvedTarget = path.resolve(target)
  const relative = path.relative(resolvedRoot, resolvedTarget)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

export function assertOwnedUploadPath(target, uploadRoot) {
  if (!isWithinRoot(target, uploadRoot)) throw new AppError('Refusing to remove a path outside the dedicated 2027 demo upload root.', { statusCode: 403, errorCode: 'DEMO_UPLOAD_GUARD' })
}

export function canonicalSourceHash(students = CANONICAL_STUDENTS_2027) {
  return createHash('sha256').update(JSON.stringify({ students, companies: CANONICAL_COMPANIES_2027, drives: CANONICAL_DRIVE_PROPOSALS_2027, studentDocuments: CANONICAL_STUDENT_RESUME_DOCUMENTS, companyDocuments: CANONICAL_COMPANY_DOCUMENTS, driveDocuments: CANONICAL_DRIVE_DOCUMENT_MAPPINGS })).digest('hex')
}

export function buildDemo2027SeedPlan({ mongoUri, resumeUploadDirectory, students = CANONICAL_STUDENTS_2027 } = {}) {
  const databaseName = assertDemo2027Database(mongoUri)
  const source = validateCanonicalStudents2027(students)
  const documents = validateDemo2027DocumentAssets()
  const uploadRoot = demo2027UploadRoot(resumeUploadDirectory)
  return { key: DEMO_2027_SEED_KEY, databaseName, uploadRoot, canonicalSourceHash: canonicalSourceHash(students), students: source, documents, companies: 5, driveProposals: 6, applications: 0, placementRecords: 0, resumeGeneration: 'assets_validated_no_uploads_created' }
}

export async function prepareDemo2027SeedManifest({ mongoUri, resumeUploadDirectory, manifestModel = Demo2027SeedManifest, students = CANONICAL_STUDENTS_2027 } = {}) {
  const plan = buildDemo2027SeedPlan({ mongoUri, resumeUploadDirectory, students })
  const existing = await manifestModel.findOne({ key: DEMO_2027_SEED_KEY })
  if (existing) {
    if (existing.canonicalSourceHash && existing.canonicalSourceHash !== plan.canonicalSourceHash && existing.status !== 'reset') throw new AppError('The existing 2027 demo manifest belongs to a different canonical source. Reset that owned seed before changing it.', { statusCode: 409, errorCode: 'CONFLICT' })
    return { manifest: existing, plan, alreadyPrepared: true }
  }
  const manifest = await manifestModel.create({ key: DEMO_2027_SEED_KEY, status: 'planned', canonicalSourceHash: plan.canonicalSourceHash, ownedUploadDirectories: [plan.uploadRoot] })
  return { manifest, plan, alreadyPrepared: false }
}

const manifestCollections = Object.freeze([
  ['notificationIds', Notification], ['placementRecordIds', PlacementRecord], ['applicationIds', Application], ['placementDriveIds', PlacementDrive],
  ['recruiterPolicyAcceptanceIds', RecruiterPolicyAcceptance], ['studentPolicyAcceptanceIds', StudentPolicyAcceptance], ['companyProfileIds', Company], ['studentProfileIds', StudentProfile],
  ['companyUserIds', User], ['studentUserIds', User], ['adminUserIds', User], ['recruiterPolicyIds', RecruiterPlacementPolicy], ['studentPolicyIds', StudentPlacementPolicy],
])

const seedTimestamp = new Date('2026-10-07T00:00:00.000Z')
const safeFilePart = value => path.basename(value).replace(/[^A-Za-z0-9._-]/g, '_')

function requireSeedPasswords({ studentPassword, companyPassword }) {
  if (!studentPassword || !companyPassword) throw new AppError('Set DEMO_2027_STUDENT_PASSWORD and DEMO_2027_COMPANY_PASSWORD before seeding.', { statusCode: 422, errorCode: 'DEMO_PASSWORD_CONFIGURATION_REQUIRED' })
}

async function copyDocumentAssets({ uploadRoot, manifest }) {
  const sourceToMetadata = new Map()
  const all = [
    ...CANONICAL_STUDENT_RESUME_DOCUMENTS.map(item => ({ ...item, category: 'students' })),
    ...CANONICAL_COMPANY_DOCUMENTS.map(item => ({ ...item, category: 'companies' })),
  ]
  for (const asset of all) {
    const source = (await import('../data/demo-2027-m9/document-assets.js')).resolveDemo2027AssetPath(asset.relativePath)
    const destination = path.join(uploadRoot, asset.category, safeFilePart(asset.relativePath))
    assertOwnedUploadPath(destination, uploadRoot)
    await mkdir(path.dirname(destination), { recursive: true })
    await copyFile(source, destination)
    const sourceStat = await stat(source)
    const metadata = { originalName: path.basename(source), storagePath: destination, mimeType: 'application/pdf', size: sourceStat.size, uploadedAt: seedTimestamp }
    sourceToMetadata.set(asset.relativePath, metadata)
    manifest.ownedUploadPaths = [...new Set([...(manifest.ownedUploadPaths ?? []), destination])]
  }
  await manifest.save()
  return sourceToMetadata
}

export async function seedDemo2027Foundation({ mongoUri, resumeUploadDirectory, studentPassword, companyPassword, saltRounds = 12, manifestModel = Demo2027SeedManifest, userModel = User, studentProfileModel = StudentProfile, companyModel = Company, placementDriveModel = PlacementDrive, studentPolicyModel = StudentPlacementPolicy, studentAcceptanceModel = StudentPolicyAcceptance, recruiterPolicyModel = RecruiterPlacementPolicy, recruiterAcceptanceModel = RecruiterPolicyAcceptance } = {}) {
  const plan = buildDemo2027SeedPlan({ mongoUri, resumeUploadDirectory })
  requireSeedPasswords({ studentPassword, companyPassword })
  const existing = await manifestModel.findOne({ key: DEMO_2027_SEED_KEY })
  if (existing?.status === 'ready') return { status: 'already_seeded', plan }
  if (existing && existing.status !== 'reset') throw new AppError('A partial 2027 seed manifest exists. Use the confirmation-gated reset before retrying.', { statusCode: 409, errorCode: 'CONFLICT' })
  const seedEmails = [...CANONICAL_STUDENTS_2027.map(student => student.email), ...CANONICAL_COMPANIES_2027.map(company => company.login.email)]
  if (await userModel.exists({ email: { $in: seedEmails } })) throw new AppError('Refusing to seed: one or more canonical 2027 emails already exist outside a ready 2027 manifest.', { statusCode: 409, errorCode: 'CONFLICT' })
  const manifest = existing ?? await manifestModel.create({ key: DEMO_2027_SEED_KEY, status: 'planned', canonicalSourceHash: plan.canonicalSourceHash, ownedUploadDirectories: [plan.uploadRoot] })
  manifest.status = 'seeding'; await manifest.save()
  try {
    const assets = await copyDocumentAssets({ uploadRoot: plan.uploadRoot, manifest })
    const studentHash = await bcrypt.hash(studentPassword, saltRounds)
    const companyHash = await bcrypt.hash(companyPassword, saltRounds)
    const studentUsers = await userModel.insertMany(CANONICAL_STUDENTS_2027.map(student => ({ name: student.name, email: student.email, passwordHash: studentHash, role: USER_ROLES.STUDENT, isActive: true })))
    manifest.studentUserIds = studentUsers.map(user => user._id)
    const usersByEmail = new Map(studentUsers.map(user => [user.email, user]))
    const studentProfiles = await studentProfileModel.insertMany(CANONICAL_STUDENTS_2027.map(student => ({ ...student, userId: usersByEmail.get(student.email)._id, resume: assets.get(CANONICAL_STUDENT_RESUME_DOCUMENTS.find(item => item.studentSourceId === student.sourceId).relativePath), verificationStatus: 'verified' })))
    manifest.studentProfileIds = studentProfiles.map(profile => profile._id)
    const companyUsers = await userModel.insertMany(CANONICAL_COMPANIES_2027.map(company => ({ name: company.profile.companyName, email: company.login.email, passwordHash: companyHash, role: USER_ROLES.COMPANY, isActive: true })))
    manifest.companyUserIds = companyUsers.map(user => user._id)
    const companyUsersByEmail = new Map(companyUsers.map(user => [user.email, user]))
    const companyProfiles = await companyModel.insertMany(CANONICAL_COMPANIES_2027.map(company => ({ ...company.profile, userId: companyUsersByEmail.get(company.login.email)._id, participationLetter: assets.get(CANONICAL_COMPANY_DOCUMENTS.find(document => document.companyKey === company.key && document.documentType === 'company_profile').relativePath), approvalStatus: 'approved' })))
    manifest.companyProfileIds = companyProfiles.map(company => company._id)
    const companyByKey = new Map(CANONICAL_COMPANIES_2027.map((company, index) => [company.key, companyProfiles[index]]))
    const documentsByDrive = new Map(CANONICAL_DRIVE_DOCUMENT_MAPPINGS.map(mapping => [mapping.driveKey, mapping]))
    const drives = await placementDriveModel.insertMany(CANONICAL_DRIVE_PROPOSALS_2027.map(drive => { const mapping = documentsByDrive.get(drive.key); return { companyId: companyByKey.get(drive.companyKey)._id, role: drive.role, driveDetails: drive.driveDetails, eligibility: drive.eligibility, phases: drive.phases, proposalStatus: 'submitted', lifecycleStatus: 'unpublished', documents: { companyRecruitmentInformation: assets.get(mapping.companyProfilePath), placementDriveJobDescription: assets.get(mapping.jobDescriptionPath), recruitmentProcessInstructions: assets.get(mapping.recruitmentInstructionsPath) } } }))
    manifest.placementDriveIds = drives.map(drive => drive._id)
    const studentPolicy = await studentPolicyModel.create({ title: 'Placement Policy 2027', academicYear: '2026-27', version: '2027.1', policyText: '2027 demo placement policy acceptance for the isolated PlacementHub workflow.', active: true })
    const recruiterPolicy = await recruiterPolicyModel.create({ title: 'Recruiter Placement Policy 2027', academicYear: '2026-27', version: '2027.1', policyText: '2027 demo recruiter policy acceptance for the isolated PlacementHub workflow.', active: true })
    manifest.studentPolicyIds = [studentPolicy._id]; manifest.recruiterPolicyIds = [recruiterPolicy._id]
    const studentAcceptances = await studentAcceptanceModel.insertMany(studentUsers.map(user => ({ studentId: user._id, policyId: studentPolicy._id, policyVersion: studentPolicy.version, acceptedAt: seedTimestamp })))
    const recruiterAcceptances = await recruiterAcceptanceModel.insertMany(companyUsers.map(user => ({ companyId: user._id, policyId: recruiterPolicy._id, policyVersion: recruiterPolicy.version, acceptedAt: seedTimestamp })))
    manifest.studentPolicyAcceptanceIds = studentAcceptances.map(item => item._id); manifest.recruiterPolicyAcceptanceIds = recruiterAcceptances.map(item => item._id)
    manifest.documentMetadata = { studentResumes: 60, companyDocuments: 15, sourceHash: plan.canonicalSourceHash }
    manifest.status = 'ready'; await manifest.save()
    return { status: 'seeded', plan, manifest }
  } catch (error) { throw error }
}

export async function verifyDemo2027Foundation({ manifestModel = Demo2027SeedManifest, userModel = User, studentProfileModel = StudentProfile, companyModel = Company, placementDriveModel = PlacementDrive, applicationModel = Application, placementRecordModel = PlacementRecord } = {}) {
  const manifest = await manifestModel.findOne({ key: DEMO_2027_SEED_KEY })
  if (!manifest || manifest.status !== 'ready') throw new AppError('The 2027 demo foundation is not ready.', { statusCode: 404, errorCode: 'NOT_FOUND' })
  const [studentUsers, studentProfiles, companies, drives, applications, placementRecords] = await Promise.all([
    userModel.countDocuments({ _id: { $in: manifest.studentUserIds }, role: USER_ROLES.STUDENT }), studentProfileModel.countDocuments({ _id: { $in: manifest.studentProfileIds }, graduationYear: 2027, verificationStatus: 'verified' }), companyModel.countDocuments({ _id: { $in: manifest.companyProfileIds }, approvalStatus: 'approved' }), placementDriveModel.countDocuments({ _id: { $in: manifest.placementDriveIds }, proposalStatus: 'submitted', lifecycleStatus: 'unpublished' }), applicationModel.countDocuments({}), placementRecordModel.countDocuments({}),
  ])
  if (studentUsers !== 60 || studentProfiles !== 60 || companies !== 5 || drives !== 6 || applications !== 0 || placementRecords !== 0) throw new AppError('2027 demo post-seed verification failed.', { statusCode: 409, errorCode: 'CONFLICT' })
  return { studentUsers, studentProfiles, companies, drives, applications, placementRecords, studentResumeAssets: 60, companyDocumentAssets: 15 }
}

async function removeOwnedRecords(manifest, collections) {
  const removed = {}
  for (const [field, model] of collections) {
    const ids = manifest[field] ?? []
    if (!ids.length) { removed[field] = 0; continue }
    const result = await model.deleteMany({ _id: { $in: ids } })
    removed[field] = result.deletedCount ?? 0
  }
  return removed
}

export async function resetDemo2027Seed({ mongoUri, resumeUploadDirectory, confirm = false, manifestModel = Demo2027SeedManifest, collections = manifestCollections, remove = rm } = {}) {
  assertDemo2027Database(mongoUri)
  if (!confirm) throw new AppError('Pass explicit confirmation before resetting the 2027 demo seed.', { statusCode: 422, errorCode: 'CONFIRMATION_REQUIRED' })
  const uploadRoot = demo2027UploadRoot(resumeUploadDirectory)
  const manifest = await manifestModel.findOne({ key: DEMO_2027_SEED_KEY })
  if (!manifest) return { status: 'not_seeded', removed: {}, uploadRoot }
  for (const target of [...(manifest.ownedUploadDirectories ?? []), ...(manifest.ownedUploadPaths ?? [])]) assertOwnedUploadPath(target, uploadRoot)
  manifest.status = 'resetting'
  await manifest.save()
  const removed = await removeOwnedRecords(manifest, collections)
  for (const target of [...(manifest.ownedUploadPaths ?? []), ...(manifest.ownedUploadDirectories ?? [])]) await remove(target, { recursive: true, force: true })
  manifest.status = 'reset'
  await manifest.save()
  return { status: 'reset', removed, uploadRoot }
}
