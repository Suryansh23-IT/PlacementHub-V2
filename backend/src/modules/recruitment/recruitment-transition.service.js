import { AppError } from '../../errors/app-error.js'
import { Application } from '../applications/application.model.js'
import { RECRUITMENT_ACTIVE_STATUSES, RECRUITMENT_TERMINAL_STATUSES } from '../applications/application.constants.js'
import { Company } from '../companies/company.model.js'
import { PLACEMENT_DRIVE_LIFECYCLE_STATUSES, PLACEMENT_DRIVE_PROPOSAL_STATUSES } from '../placement-drives/placement-drive.constants.js'
import { PlacementDrive } from '../placement-drives/placement-drive.model.js'
import { recruitmentTransitionSchema } from './recruitment-transition.validation.js'

const notFound = message => new AppError(message, { statusCode: 404, errorCode: 'NOT_FOUND' })
const conflict = message => new AppError(message, { statusCode: 409, errorCode: 'CONFLICT' })
const invalid = message => new AppError(message, { statusCode: 422, errorCode: 'VALIDATION_ERROR' })

function plain(value) { return value?.toObject ? value.toObject() : value }
function assign(document, values) { if (typeof document.set === 'function') document.set(values); else Object.assign(document, values) }
function appendHistory(application, entry) { return [...(plain(application).phaseHistory ?? []), entry] }
function assertPhase(phase, phaseNumbers) {
  if (phase !== 0 && !phaseNumbers.has(phase)) throw invalid('The requested Company phase does not exist on this Placement Drive.')
}
function parseTransition(input) {
  const parsed = recruitmentTransitionSchema.safeParse(input)
  if (parsed.success) return parsed.data
  throw invalid(parsed.error.issues[0]?.message ?? 'The recruitment transition is invalid.')
}

async function getCompanyOwnedPublishedApplication(companyUserId, driveId, applicationId, { companyModel = Company, placementDriveModel = PlacementDrive, applicationModel = Application } = {}) {
  const company = await companyModel.findOne({ userId: companyUserId, approvalStatus: 'approved' })
  if (!company) throw new AppError('Only approved Companies can execute recruitment transitions.', { statusCode: 403, errorCode: 'FORBIDDEN' })
  const drive = await placementDriveModel.findOne({ _id: driveId, companyId: company._id })
  if (!drive) throw notFound('Placement Drive was not found.')
  if (drive.proposalStatus !== PLACEMENT_DRIVE_PROPOSAL_STATUSES.APPROVED || drive.lifecycleStatus !== PLACEMENT_DRIVE_LIFECYCLE_STATUSES.PUBLISHED) {
    throw conflict('Recruitment transitions are unavailable unless the Placement Drive is published.')
  }
  const application = await applicationModel.findOne({ _id: applicationId, placementDriveId: drive._id })
  if (!application) throw notFound('Application was not found in this Placement Drive.')
  return { drive: plain(drive), application }
}

function assertNotTerminal(application) {
  if (RECRUITMENT_TERMINAL_STATUSES.includes(application.currentStatus)) {
    throw conflict('This application is closed and cannot advance through recruitment.')
  }
}

function assertActive(application, action) {
  if (!RECRUITMENT_ACTIVE_STATUSES.includes(application.currentStatus)) throw conflict(`Cannot ${action.replaceAll('_', ' ')} while the candidate is ${application.currentStatus}.`)
}

async function applyTransition(application, actorId, { action, phase, status, reason, now }, applicationModel = Application) {
  const event = { phase, status, event: action, occurredAt: now, actorId, ...(reason ? { note: reason } : {}) }
  const value = plain(application)
  const next = { currentPhase: phase, currentStatus: status, phaseHistory: appendHistory(application, event) }
  // The conditional write rejects a second click/request that loaded an older
  // candidate state, preserving every already-recorded transition.
  if (typeof applicationModel.findOneAndUpdate === 'function') {
    const saved = await applicationModel.findOneAndUpdate({ _id: value._id, placementDriveId: value.placementDriveId, currentPhase: value.currentPhase, currentStatus: value.currentStatus }, { $set: next }, { returnDocument: 'after' })
    if (!saved) throw conflict('This candidate changed since the action was opened. Refresh and try again.')
    return saved
  }
  assign(application, next)
  return application.save()
}

/**
 * Executes only Company-owned M7 candidate state changes. It does not create
 * placement records or alter the immutable M5 phase blueprint. Restrictions
 * remain M6 future-drive eligibility rules and do not retroactively eject an
 * already-created Application from its recruitment journey.
 */
export async function executeCompanyRecruitmentTransition(companyUserId, driveId, applicationId, input, dependencies = {}) {
  const transition = parseTransition(input)
  const { drive, application: sourceApplication } = await getCompanyOwnedPublishedApplication(companyUserId, driveId, applicationId, dependencies)
  const application = plain(sourceApplication)
  const now = new Date(dependencies.now ?? Date.now())
  const phaseNumbers = new Set((drive.phases ?? []).map(phase => phase.phaseNumber))
  const applicationModel = dependencies.applicationModel ?? Application
  const finalPhase = Math.max(...phaseNumbers)
  assertPhase(application.currentPhase, phaseNumbers)

  if (transition.action === 'advance') {
    assertNotTerminal(application); assertActive(application, 'advance')
    const expected = application.currentPhase + 1
    if (transition.targetPhase !== expected) throw conflict('Candidates may advance only to the next consecutive phase.')
    assertPhase(expected, phaseNumbers)
    return applyTransition(sourceApplication, companyUserId, { action: 'advanced', phase: expected, status: 'active', now }, applicationModel)
  }
  if (transition.action === 'move_backward') {
    assertNotTerminal(application); assertActive(application, 'move backward')
    if (application.currentPhase === 0 || transition.targetPhase >= application.currentPhase) throw conflict('A correction must move the candidate to an earlier phase.')
    assertPhase(transition.targetPhase, phaseNumbers)
    return applyTransition(sourceApplication, companyUserId, { action: 'moved_backward', phase: transition.targetPhase, status: 'active', reason: transition.reason, now }, applicationModel)
  }
  if (transition.action === 'reject') {
    assertNotTerminal(application); assertActive(application, 'reject')
    return applyTransition(sourceApplication, companyUserId, { action: 'rejected', phase: application.currentPhase, status: 'rejected', reason: transition.reason, now }, applicationModel)
  }
  if (transition.action === 'mark_absent') {
    assertNotTerminal(application); assertActive(application, 'mark absent')
    return applyTransition(sourceApplication, companyUserId, { action: 'marked_absent', phase: application.currentPhase, status: 'absent', reason: transition.reason, now }, applicationModel)
  }
  if (transition.action === 'restore_absent') {
    assertNotTerminal(application)
    if (application.currentStatus !== 'absent') throw conflict('Only an absent candidate can be restored.')
    return applyTransition(sourceApplication, companyUserId, { action: 'restored_absent', phase: application.currentPhase, status: 'active', reason: transition.reason, now }, applicationModel)
  }
  if (transition.action === 'restore_rejected') {
    assertNotTerminal(application)
    if (application.currentStatus !== 'rejected') throw conflict('Only a rejected candidate can be restored.')
    return applyTransition(sourceApplication, companyUserId, { action: 'restored_rejected', phase: application.currentPhase, status: 'active', reason: transition.reason, now }, applicationModel)
  }
  if (transition.action === 'provisionally_select') {
    assertNotTerminal(application); assertActive(application, 'provisionally select')
    if (application.currentPhase !== finalPhase) throw conflict('Provisional selection is allowed only from the final Company phase.')
    return applyTransition(sourceApplication, companyUserId, { action: 'provisionally_selected', phase: finalPhase, status: 'selected_pending_confirmation', reason: transition.reason, now }, applicationModel)
  }
  if (transition.action === 'unselect') {
    assertNotTerminal(application)
    if (application.currentStatus !== 'selected_pending_confirmation') throw conflict('Only a provisionally selected candidate can be unselected.')
    return applyTransition(sourceApplication, companyUserId, { action: 'unselected', phase: finalPhase, status: 'active', reason: transition.reason, now }, applicationModel)
  }
  if (transition.action === 'close_placed_elsewhere') {
    assertNotTerminal(application)
    return applyTransition(sourceApplication, companyUserId, { action: 'closed_placed_elsewhere', phase: application.currentPhase, status: 'closed_placed_elsewhere', reason: transition.reason, now }, applicationModel)
  }
  throw invalid('The recruitment transition is not supported.')
}
