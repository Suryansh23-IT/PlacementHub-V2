export const APPLICATION_STATUSES = Object.freeze([
  'applied',
  'screening',
  'pending',
  'result_pending',
  'qualified',
  'rejected',
  'absent',
  'disqualified',
  'selected',
  'withdrawn',
])

export const ELIGIBILITY_REASON_CODES = Object.freeze({
  STUDENT_NOT_FOUND: 'student_not_found',
  STUDENT_NOT_VERIFIED: 'student_not_verified',
  STUDENT_POLICY_NOT_ACCEPTED: 'student_policy_not_accepted',
  DRIVE_NOT_FOUND: 'drive_not_found',
  DRIVE_NOT_OPEN: 'drive_not_open',
  APPLICATION_DEADLINE_PASSED: 'application_deadline_passed',
  APPLICATIONS_MANUALLY_CLOSED: 'applications_manually_closed',
  BRANCH_NOT_ELIGIBLE: 'branch_not_eligible',
  MINIMUM_CGPA_NOT_MET: 'minimum_cgpa_not_met',
  TOO_MANY_ACTIVE_BACKLOGS: 'too_many_active_backlogs',
  GRADUATION_YEAR_NOT_ELIGIBLE: 'graduation_year_not_eligible',
  PLACEMENT_RESTRICTED: 'placement_restricted',
})

export const WITHDRAWABLE_APPLICATION_STATUSES = Object.freeze(['applied', 'screening', 'pending', 'result_pending', 'qualified'])
