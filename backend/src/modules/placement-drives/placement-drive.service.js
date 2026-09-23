import { readFile, unlink } from 'node:fs/promises'
import { AppError } from '../../errors/app-error.js'
import { Company } from '../companies/company.model.js'
import { getInstitutionProfile } from '../institution/institution.service.js'
import { getRecruiterPolicyStatus } from '../recruiter-policy/recruiter-policy.service.js'
import { PLACEMENT_DRIVE_LIFECYCLE_STATUSES, PLACEMENT_DRIVE_PROPOSAL_STATUSES } from './placement-drive.constants.js'
import { PlacementDrive } from './placement-drive.model.js'
import { placementDriveSubmissionSchema } from './placement-drive.validation.js'

const notFound = () => new AppError('Placement Drive proposal was not found.', { statusCode: 404, errorCode: 'NOT_FOUND' })
const conflict = (message) => new AppError(message, { statusCode: 409, errorCode: 'CONFLICT' })

export async function getPlacementDriveBranches({ institutionService = getInstitutionProfile } = {}) {
  const institution = await institutionService()
  return institution.branches ?? []
}

async function assertKnownEligibilityBranches(input, { institutionService = getInstitutionProfile } = {}) {
  const branches = await getPlacementDriveBranches({ institutionService })
  const knownBranches = new Set(branches)
  const unknown = input.eligibility.allowedBranches.find(branch => !knownBranches.has(branch))
  if (unknown) throw new AppError('Select only branches configured by the Placement Admin.', { statusCode: 422, errorCode: 'VALIDATION_ERROR' })
}

export async function getApprovedCompanyForDrive(companyUserId, { companyModel = Company } = {}) {
  const company = await companyModel.findOne({ userId: companyUserId, approvalStatus: 'approved' }).select('_id')
  if (!company) throw new AppError('Only approved companies can create Placement Drive proposals.', { statusCode: 403, errorCode: 'FORBIDDEN' })
  return company
}

export async function createPlacementDriveDraft(companyUserId, input, { companyModel = Company, placementDriveModel = PlacementDrive, institutionService = getInstitutionProfile } = {}) {
  const company = await getApprovedCompanyForDrive(companyUserId, { companyModel })
  await assertKnownEligibilityBranches(input, { institutionService })
  return placementDriveModel.create({
    ...input,
    companyId: company._id,
    proposalStatus: PLACEMENT_DRIVE_PROPOSAL_STATUSES.DRAFT,
    lifecycleStatus: PLACEMENT_DRIVE_LIFECYCLE_STATUSES.UNPUBLISHED,
  })
}

export async function listMyPlacementDrives(companyUserId, { companyModel = Company, placementDriveModel = PlacementDrive } = {}) {
  const company = await getApprovedCompanyForDrive(companyUserId, { companyModel })
  return placementDriveModel.find({ companyId: company._id }).sort({ updatedAt: -1 })
}

export async function getMyPlacementDrive(companyUserId, driveId, { companyModel = Company, placementDriveModel = PlacementDrive } = {}) {
  const company = await getApprovedCompanyForDrive(companyUserId, { companyModel })
  const drive = await placementDriveModel.findOne({ _id: driveId, companyId: company._id })
  if (!drive) throw notFound()
  return drive
}

function requireEditable(drive) {
  if (![PLACEMENT_DRIVE_PROPOSAL_STATUSES.DRAFT, PLACEMENT_DRIVE_PROPOSAL_STATUSES.CHANGES_REQUESTED].includes(drive.proposalStatus)) {
    throw conflict('Only draft or changes-requested Placement Drive proposals can be edited.')
  }
}

function assignDrive(drive, input) {
  if (typeof drive.set === 'function') drive.set(input)
  else Object.assign(drive, input)
}

export async function updateMyPlacementDrive(companyUserId, driveId, input, dependencies = {}) {
  const drive = await getMyPlacementDrive(companyUserId, driveId, dependencies)
  requireEditable(drive)
  await assertKnownEligibilityBranches(input, dependencies)
  assignDrive(drive, input)
  return drive.save()
}

export async function saveMyPlacementDriveDocument(companyUserId, driveId, type, file, dependencies = {}) {
  if (!file) throw new AppError('Attach a PDF document.', { statusCode: 422, errorCode: 'VALIDATION_ERROR' })
  const bytes = await readFile(file.path).catch(() => null)
  if (!bytes?.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    await unlink(file.path).catch(() => {})
    throw new AppError('The uploaded file is not a valid PDF.', { statusCode: 422, errorCode: 'VALIDATION_ERROR' })
  }
  const drive = await getMyPlacementDrive(companyUserId, driveId, dependencies)
  try {
    requireEditable(drive)
    const previous = drive.documents?.[type]?.storagePath
    const metadata = { originalName: file.originalname, storagePath: file.path, mimeType: file.mimetype, size: file.size, uploadedAt: new Date() }
    if (typeof drive.set === 'function') drive.set(`documents.${type}`, metadata)
    else { drive.documents ??= {}; drive.documents[type] = metadata }
    const saved = await drive.save()
    if (previous && previous !== file.path) await unlink(previous).catch(() => {})
    return saved
  } catch (error) {
    await unlink(file.path).catch(() => {})
    throw error
  }
}

export async function getMyPlacementDriveDocument(companyUserId, driveId, type, dependencies = {}) {
  const drive = await getMyPlacementDrive(companyUserId, driveId, dependencies)
  const document = drive.documents?.[type]
  if (!document) throw new AppError('The requested Placement Drive PDF has not been uploaded.', { statusCode: 404, errorCode: 'NOT_FOUND' })
  return document
}

async function requireCurrentRecruiterPolicyAcceptance(companyUserId, policyDependencies) {
  const { policy, acceptance } = await getRecruiterPolicyStatus(companyUserId, policyDependencies)
  if (!policy || !acceptance) throw new AppError('Accept the active Recruiter Placement Policy before submitting a Placement Drive proposal.', { statusCode: 403, errorCode: 'FORBIDDEN' })
}

function assertReadyForSubmission(drive) {
  const value = drive.toObject ? drive.toObject() : drive
  const parsed = placementDriveSubmissionSchema.safeParse(value)
  if (!parsed.success) throw conflict('Complete the structured proposal details and upload both required PDFs before submitting.')
}

async function submit(companyUserId, driveId, allowedStatus, dependencies = {}) {
  const drive = await getMyPlacementDrive(companyUserId, driveId, dependencies)
  if (drive.proposalStatus !== allowedStatus) throw conflict(allowedStatus === PLACEMENT_DRIVE_PROPOSAL_STATUSES.DRAFT ? 'Only draft Placement Drive proposals can be submitted.' : 'Only changes-requested Placement Drive proposals can be resubmitted.')
  await assertKnownEligibilityBranches(drive.toObject ? drive.toObject() : drive, dependencies)
  await requireCurrentRecruiterPolicyAcceptance(companyUserId, dependencies.policyDependencies)
  assertReadyForSubmission(drive)
  assignDrive(drive, { proposalStatus: PLACEMENT_DRIVE_PROPOSAL_STATUSES.SUBMITTED, review: {} })
  return drive.save()
}

export const submitMyPlacementDrive = (companyUserId, driveId, dependencies) => submit(companyUserId, driveId, PLACEMENT_DRIVE_PROPOSAL_STATUSES.DRAFT, dependencies)
export const resubmitMyPlacementDrive = (companyUserId, driveId, dependencies) => submit(companyUserId, driveId, PLACEMENT_DRIVE_PROPOSAL_STATUSES.CHANGES_REQUESTED, dependencies)

export async function listPlacementDriveProposals({ placementDriveModel = PlacementDrive } = {}) {
  return placementDriveModel.find({}).sort({ updatedAt: -1 })
}

export async function getPlacementDriveProposal(driveId, { placementDriveModel = PlacementDrive } = {}) {
  const drive = await placementDriveModel.findOne({ _id: driveId })
  if (!drive) throw notFound()
  return drive
}

export async function reviewPlacementDriveProposal(driveId, adminId, input, dependencies = {}) {
  const drive = await getPlacementDriveProposal(driveId, dependencies)
  if (drive.proposalStatus !== PLACEMENT_DRIVE_PROPOSAL_STATUSES.SUBMITTED) throw conflict('Only submitted Placement Drive proposals can be reviewed.')
  const review = { reviewedBy: adminId, reviewedAt: new Date() }
  if (input.decision === PLACEMENT_DRIVE_PROPOSAL_STATUSES.APPROVED) {
    assignDrive(drive, { proposalStatus: PLACEMENT_DRIVE_PROPOSAL_STATUSES.APPROVED, review })
  } else if (input.decision === PLACEMENT_DRIVE_PROPOSAL_STATUSES.REJECTED) {
    assignDrive(drive, { proposalStatus: PLACEMENT_DRIVE_PROPOSAL_STATUSES.REJECTED, review: { ...review, rejectionReason: input.reason } })
  } else {
    assignDrive(drive, { proposalStatus: PLACEMENT_DRIVE_PROPOSAL_STATUSES.CHANGES_REQUESTED, review: { ...review, requestedChanges: input.reason } })
  }
  return drive.save()
}

export async function getPlacementDriveDocumentForAdmin(driveId, type, dependencies = {}) {
  const drive = await getPlacementDriveProposal(driveId, dependencies)
  const document = drive.documents?.[type]
  if (!document) throw new AppError('The requested Placement Drive PDF has not been uploaded.', { statusCode: 404, errorCode: 'NOT_FOUND' })
  return document
}
