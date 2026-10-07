import { createHash } from 'node:crypto'
import { readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { Application } from '../src/modules/applications/application.model.js'
import { PlacementRestriction } from '../src/modules/applications/placement-restriction.model.js'
import { User } from '../src/modules/auth/auth.model.js'
import { Company } from '../src/modules/companies/company.model.js'
import { IncidentReport } from '../src/modules/incidents/incident-report.model.js'
import { Notification } from '../src/modules/notifications/notification.model.js'
import { PlacementDrive } from '../src/modules/placement-drives/placement-drive.model.js'
import { PlacementRecord } from '../src/modules/placements/placement-record.model.js'
import { RecruiterPolicyAcceptance } from '../src/modules/recruiter-policy/recruiter-policy.model.js'
import { StudentPolicyAcceptance } from '../src/modules/student-policy/student-policy.model.js'
import { StudentProfile } from '../src/modules/students/student.model.js'
import { HISTORICAL_SEED_KEY, HistoricalSeedManifest } from './historical-seed-manifest.js'

const nonNegativeInteger = z.number().int().nonnegative()
const positiveCtcSchema = z.object({
  amount: z.number().positive(),
  currency: z.literal('INR').default('INR'),
  period: z.enum(['per_annum', 'per_month']),
}).strict().nullable()

const branchTargetSchema = z.object({
  branch: z.string().trim().min(1).max(100),
  batchSize: nonNegativeInteger,
  eligible: nonNegativeInteger,
  offers: nonNegativeInteger,
  uniquePlaced: nonNegativeInteger,
  averageCTC: positiveCtcSchema,
  medianCTC: positiveCtcSchema,
  highestCTC: positiveCtcSchema,
  lowestCTC: positiveCtcSchema,
  rollPrefix: z.string().regex(/^22[A-Z]{2,8}$/),
}).strict().superRefine((target, context) => {
  if (target.eligible > target.batchSize) context.addIssue({ code: 'custom', path: ['eligible'], message: 'eligible cannot exceed batchSize.' })
  if (target.uniquePlaced > target.eligible) context.addIssue({ code: 'custom', path: ['uniquePlaced'], message: 'uniquePlaced cannot exceed eligible.' })
  if (target.offers < target.uniquePlaced) context.addIssue({ code: 'custom', path: ['offers'], message: 'offers cannot be below uniquePlaced.' })
  if (target.lowestCTC && target.medianCTC && target.highestCTC && (target.lowestCTC.amount > target.medianCTC.amount || target.medianCTC.amount > target.highestCTC.amount)) {
    context.addIssue({ code: 'custom', path: ['medianCTC'], message: 'CTC values must satisfy lowest <= median <= highest.' })
  }
})

const processSchema = z.object({
  sourceRow: z.number().int().min(1),
  companyName: z.string().trim().min(1).max(160),
  normalizedCompanyKey: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  rawOfferType: z.string().trim(),
  outcomeType: z.enum(['FULL_TIME', 'PPO', 'INTERNSHIP', 'INTERNSHIP_AND_PPO']).nullable(),
  originalSector: z.string().trim(),
  roleFamily: z.enum(['SDE', 'ANALYST_DATA', 'CORE', 'CONSULTING_FINANCE', 'EDUCATION_MISC']),
  processMode: z.enum(['ONLINE', 'OFFLINE', 'HYBRID']).nullable(),
  rawProcessMode: z.string().trim(),
  placementSource: z.enum(['ON_CAMPUS', 'OFF_CAMPUS']),
  sourceProcessDate: z.string().nullable(),
  startDate: z.string().date().nullable(),
  endDate: z.string().date().nullable(),
  ctcLpa: z.number().positive().nullable(),
  rawBranchOffers: z.record(z.string(), nonNegativeInteger),
}).strict()

export const historicalCanonicalInputSchema = z.object({
  metadata: z.object({
    seedKey: z.literal(HISTORICAL_SEED_KEY),
    academicYear: z.literal('2025-26'),
    institution: z.string().trim().min(1),
    programme: z.literal('B.Tech'),
    targetTotals: z.object({ eligible: z.literal(844), confirmedOffers: z.literal(705), uniquePlaced: z.literal(627) }).strict(),
    identityConvention: z.object({
      studentRollFormat: z.literal('22<BRANCH><3-digit number>'),
      studentEmailFormat: z.literal('<branch><number>@ait.ac.in'),
      companyEmailFormat: z.literal('<normalized-company-key>@placement.ait.ac.in'),
      passwordSource: z.string().min(1),
    }).strict(),
  }).strict(),
  branchTargets: z.array(branchTargetSchema),
  processes: z.array(processSchema),
  reconciliation: z.object({ rawBranchOffers: z.record(z.string(), nonNegativeInteger), canonicalBranchOffers: z.record(z.string(), nonNegativeInteger), deltaCanonicalMinusRaw: z.record(z.string(), z.number().int()), note: z.string().min(1) }).strict(),
}).strict().superRefine((input, context) => {
  const branchNames = input.branchTargets.map(target => target.branch.toLowerCase())
  if (new Set(branchNames).size !== branchNames.length) context.addIssue({ code: 'custom', path: ['branchTargets'], message: 'Branch targets must be unique.' })
  const target = input.metadata.targetTotals
  const totals = input.branchTargets.reduce((sum, branch) => ({
    eligible: sum.eligible + branch.eligible,
    offers: sum.offers + branch.offers,
    uniquePlaced: sum.uniquePlaced + branch.uniquePlaced,
  }), { eligible: 0, offers: 0, uniquePlaced: 0 })
  if (input.branchTargets.length && (totals.eligible !== target.eligible || totals.offers !== target.confirmedOffers || totals.uniquePlaced !== target.uniquePlaced)) {
    context.addIssue({ code: 'custom', path: ['branchTargets'], message: 'Branch totals must reconcile with metadata.targetTotals.' })
  }
  if (input.processes.length && new Set(input.processes.map(process => process.sourceRow)).size !== input.processes.length) context.addIssue({ code: 'custom', path: ['processes'], message: 'Source rows must be unique.' })
})

const modelDependencies = {
  HistoricalSeedManifest,
  Notification,
  PlacementRecord,
  PlacementRestriction,
  IncidentReport,
  Application,
  PlacementDrive,
  StudentPolicyAcceptance,
  RecruiterPolicyAcceptance,
  StudentProfile,
  Company,
  User,
}

const manifestFields = [
  ['notifications', 'notificationIds', 'Notification'],
  ['placementRecords', 'placementRecordIds', 'PlacementRecord'],
  ['placementRestrictions', 'placementRestrictionIds', 'PlacementRestriction'],
  ['incidents', 'incidentReportIds', 'IncidentReport'],
  ['applications', 'applicationIds', 'Application'],
  ['placementDrives', 'placementDriveIds', 'PlacementDrive'],
  ['studentPolicyAcceptances', 'studentPolicyAcceptanceIds', 'StudentPolicyAcceptance'],
  ['recruiterPolicyAcceptances', 'recruiterPolicyAcceptanceIds', 'RecruiterPolicyAcceptance'],
  ['studentProfiles', 'studentProfileIds', 'StudentProfile'],
  ['companies', 'companyProfileIds', 'Company'],
]

function ids(values = []) {
  return values.filter(Boolean)
}

function idQuery(values) {
  return { _id: { $in: ids(values) } }
}

export const defaultHistoricalSeedInputPath = path.resolve('data', 'historical-2025-26.json')
export const defaultHistoricalSeedUploadRoot = path.resolve('uploads', 'historical-seeds', HISTORICAL_SEED_KEY)

export async function loadHistoricalCanonicalInput({ filePath = defaultHistoricalSeedInputPath, read = readFile } = {}) {
  const raw = await read(filePath, 'utf8')
  const parsed = historicalCanonicalInputSchema.parse(JSON.parse(raw))
  return { input: parsed, hash: createHash('sha256').update(raw).digest('hex'), filePath }
}

export async function validateHistoricalSeedInvocation(options = {}) {
  const loaded = await loadHistoricalCanonicalInput(options)
  return {
    seedKey: loaded.input.metadata.seedKey,
    status: 'validated_only',
    generatedRecords: 0,
    canonicalInputHash: loaded.hash,
    canonicalInputPath: loaded.filePath,
  }
}

export async function auditHistoricalSeed({ key = HISTORICAL_SEED_KEY, dependencies = modelDependencies } = {}) {
  const manifest = await dependencies.HistoricalSeedManifest.findOne({ seedKey: key })
  if (!manifest) return { key, found: false, records: {}, ownedUploadDirectories: [], ownedUploadPaths: [] }
  const records = {}
  for (const [label, field, modelName] of manifestFields) {
    records[label] = await dependencies[modelName].countDocuments(idQuery(manifest[field]))
  }
  const userIds = [...ids(manifest.studentUserIds), ...ids(manifest.companyUserIds)]
  records.users = await dependencies.User.countDocuments(idQuery(userIds))
  return {
    key,
    found: true,
    manifest,
    records,
    ownedUploadDirectories: ids(manifest.ownedUploadDirectories),
    ownedUploadPaths: ids(manifest.ownedUploadPaths),
  }
}

function isWithinRoot(candidate, root) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate))
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

async function removeOwnedFiles({ directories, paths, uploadRoot, remove = rm }) {
  const targets = [...directories, ...paths]
  for (const target of targets) {
    if (!isWithinRoot(target, uploadRoot)) throw new Error(`Refusing to remove a path outside the historical seed upload root: ${target}`)
  }
  for (const target of targets) await remove(target, { recursive: true, force: true })
}

export async function resetHistoricalSeed({ key = HISTORICAL_SEED_KEY, confirm = false, dependencies = modelDependencies, uploadRoot = defaultHistoricalSeedUploadRoot, remove = rm } = {}) {
  const audit = await auditHistoricalSeed({ key, dependencies })
  const result = {
    ...audit,
    mode: confirm ? 'execute' : 'dry_run',
    requiresConfirmation: !confirm,
    deletionOrder: manifestFields.map(([label]) => label).concat('users', 'ownedUploadFiles', 'manifest'),
  }
  if (!confirm || !audit.found) return { ...result, removed: false }

  // Validate file ownership before deleting database records so a malformed
  // manifest cannot leave a partial reset behind.
  const ownedTargets = [...audit.ownedUploadDirectories, ...audit.ownedUploadPaths]
  for (const target of ownedTargets) {
    if (!isWithinRoot(target, uploadRoot)) throw new Error(`Refusing to remove a path outside the historical seed upload root: ${target}`)
  }
  for (const [, field, modelName] of manifestFields) {
    await dependencies[modelName].deleteMany(idQuery(audit.manifest[field]))
  }
  const userIds = [...ids(audit.manifest.studentUserIds), ...ids(audit.manifest.companyUserIds)]
  await dependencies.User.deleteMany(idQuery(userIds))
  await removeOwnedFiles({ directories: audit.ownedUploadDirectories, paths: audit.ownedUploadPaths, uploadRoot, remove })
  await dependencies.HistoricalSeedManifest.deleteOne({ _id: audit.manifest._id })
  return { ...result, removed: true }
}
