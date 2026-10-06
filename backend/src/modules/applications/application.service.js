import { AppError } from '../../errors/app-error.js'
import { PlacementDrive } from '../placement-drives/placement-drive.model.js'
import { PLACEMENT_DRIVE_LIFECYCLE_STATUSES, PLACEMENT_DRIVE_PROPOSAL_STATUSES } from '../placement-drives/placement-drive.constants.js'
import { getStudentPolicyStatus } from '../student-policy/student-policy.service.js'
import { StudentProfile } from '../students/student.model.js'
import { APPLICATION_STATUSES, ELIGIBILITY_REASON_CODES } from './application.constants.js'
import { Application } from './application.model.js'
import { getActivePlacementRestriction, consumePlacementRestrictionForDrive } from './placement-restriction.service.js'
import { getApplicationWindowStatus } from '../placement-drives/placement-drive.application-window.js'

const ineligible = (code, message) => ({ code, message })
const duplicateApplication = () => new AppError('You have already applied to this Placement Drive.', { statusCode: 409, errorCode: 'CONFLICT' })

export async function evaluatePlacementDriveEligibility(studentId, placementDriveId, {
  profileModel = StudentProfile,
  placementDriveModel = PlacementDrive,
  studentPolicyStatusService = getStudentPolicyStatus,
  placementRestrictionService = getActivePlacementRestriction,
  restrictionDependencies,
  policyDependencies,
  placementRecordModel = null,
  enforceConfirmedPlacementLock = false,
  now = new Date(),
} = {}) {
  const [student, drive, restriction, confirmedOutcome] = await Promise.all([
    profileModel.findOne({ userId: studentId }),
    placementDriveModel.findOne({ _id: placementDriveId }),
    placementRestrictionService(studentId, restrictionDependencies),
    enforceConfirmedPlacementLock && placementRecordModel ? placementRecordModel.findOne({ studentId, verificationState: 'confirmed', outcomeType: { $in: ['full_time', 'ppo', 'internship_and_ppo', 'internship'] } }) : Promise.resolve(null),
  ])
  const reasons = []

  if (restriction) {
    const message = restriction.type === 'permanent'
      ? 'Placement participation is restricted by Placement Administration.'
      : `Restricted from the next ${restriction.remainingDriveCount} Placement Drive${restriction.remainingDriveCount === 1 ? '' : 's'}.`
    reasons.push(ineligible(ELIGIBILITY_REASON_CODES.PLACEMENT_RESTRICTED, message))
  }
  if (confirmedOutcome) reasons.push(ineligible(ELIGIBILITY_REASON_CODES.PLACEMENT_CONFIRMED_ELSEWHERE, 'You have a confirmed placement outcome and cannot apply to another incompatible Placement Drive.'))

  if (!student) reasons.push(ineligible(ELIGIBILITY_REASON_CODES.STUDENT_NOT_FOUND, 'Student profile was not found.'))
  else if (student.verificationStatus !== 'verified') reasons.push(ineligible(ELIGIBILITY_REASON_CODES.STUDENT_NOT_VERIFIED, 'Student profile must be verified before applying.'))

  const { acceptance } = await studentPolicyStatusService(studentId, policyDependencies)
  if (!acceptance) reasons.push(ineligible(ELIGIBILITY_REASON_CODES.STUDENT_POLICY_NOT_ACCEPTED, 'Accept the active Student Placement Policy before applying.'))

  if (!drive) {
    reasons.push(ineligible(ELIGIBILITY_REASON_CODES.DRIVE_NOT_FOUND, 'Placement Drive was not found.'))
    return { eligible: false, reasons }
  }

  const applicationWindow = getApplicationWindowStatus(drive, now)
  if (applicationWindow.reason === 'drive_not_open') reasons.push(ineligible(ELIGIBILITY_REASON_CODES.DRIVE_NOT_OPEN, 'Placement Drive is not open for applications.'))
  if (applicationWindow.reason === 'manually_closed') reasons.push(ineligible(ELIGIBILITY_REASON_CODES.APPLICATIONS_MANUALLY_CLOSED, 'Applications for this Placement Drive are closed.'))
  if (applicationWindow.reason === 'deadline_passed') reasons.push(ineligible(ELIGIBILITY_REASON_CODES.APPLICATION_DEADLINE_PASSED, 'The application deadline for this Placement Drive has passed.'))

  if (student) {
    const eligibility = drive.eligibility ?? {}
    if (!eligibility.allowedBranches?.includes(student.branch)) reasons.push(ineligible(ELIGIBILITY_REASON_CODES.BRANCH_NOT_ELIGIBLE, 'Your branch is not eligible for this Placement Drive.'))
    if (student.cgpa == null || student.cgpa < eligibility.minimumCgpa) reasons.push(ineligible(ELIGIBILITY_REASON_CODES.MINIMUM_CGPA_NOT_MET, 'Your CGPA does not meet the minimum requirement.'))
    if (student.activeBacklogs == null || student.activeBacklogs > eligibility.maximumActiveBacklogs) reasons.push(ineligible(ELIGIBILITY_REASON_CODES.TOO_MANY_ACTIVE_BACKLOGS, 'Your active backlogs exceed the permitted maximum.'))
    if (!eligibility.graduationYears?.includes(student.graduationYear)) reasons.push(ineligible(ELIGIBILITY_REASON_CODES.GRADUATION_YEAR_NOT_ELIGIBLE, 'Your graduation year is not eligible for this Placement Drive.'))
  }

  return { eligible: reasons.length === 0, reasons }
}

export async function createPlacementDriveApplication(studentId, placementDriveId, dependencies = {}) {
  const applicationModel = dependencies.applicationModel ?? Application
  // Retained withdrawals are still applications. Reject a retry before evaluating
  // restrictions so the original drive cannot consume a future-drive penalty slot.
  if (await applicationModel.findOne({ studentId, placementDriveId })) throw duplicateApplication()
  const eligibility = await evaluatePlacementDriveEligibility(studentId, placementDriveId, dependencies)
  if (!eligibility.eligible) {
    const onlyRestriction = eligibility.reasons.length === 1 && eligibility.reasons[0].code === ELIGIBILITY_REASON_CODES.PLACEMENT_RESTRICTED
    if (onlyRestriction) await (dependencies.consumePlacementRestrictionService ?? consumePlacementRestrictionForDrive)(studentId, placementDriveId, { ...(dependencies.restrictionDependencies ?? {}), now: dependencies.now })
    return { ...eligibility, application: null }
  }

  const appliedAt = new Date(dependencies.now ?? Date.now())
  try {
    const application = await applicationModel.create({
      studentId,
      placementDriveId,
      appliedAt,
      currentPhase: 0,
      currentStatus: 'applied',
      phaseHistory: [{ phase: 0, status: 'applied', event: 'applied', occurredAt: appliedAt }],
    })
    return { eligible: true, reasons: [], application }
  } catch (error) {
    if (error?.code === 11000) throw duplicateApplication()
    throw error
  }
}

export { APPLICATION_STATUSES }
