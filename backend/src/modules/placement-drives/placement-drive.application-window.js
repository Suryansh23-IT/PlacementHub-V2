import { PLACEMENT_DRIVE_LIFECYCLE_STATUSES, PLACEMENT_DRIVE_PROPOSAL_STATUSES } from './placement-drive.constants.js'

export function getApplicationWindowStatus(drive, now = new Date()) {
  const deadline = drive?.driveDetails?.applicationDeadline ? new Date(drive.driveDetails.applicationDeadline) : null
  const published = drive?.proposalStatus === PLACEMENT_DRIVE_PROPOSAL_STATUSES.APPROVED && drive?.lifecycleStatus === PLACEMENT_DRIVE_LIFECYCLE_STATUSES.PUBLISHED
  if (!published) return { open: false, reason: 'drive_not_open', deadline }
  if (drive.applicationsManuallyClosedAt) return { open: false, reason: 'manually_closed', deadline }
  if (!deadline || deadline.getTime() <= new Date(now).getTime()) return { open: false, reason: 'deadline_passed', deadline }
  return { open: true, reason: 'open', deadline }
}
