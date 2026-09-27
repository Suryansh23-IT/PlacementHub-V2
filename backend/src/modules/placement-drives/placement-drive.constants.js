export const PLACEMENT_DRIVE_PROPOSAL_STATUSES = Object.freeze({
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  CHANGES_REQUESTED: 'changes_requested',
  APPROVED: 'approved',
  REJECTED: 'rejected',
})

export const PLACEMENT_DRIVE_LIFECYCLE_STATUSES = Object.freeze({
  UNPUBLISHED: 'unpublished',
  PUBLISHED: 'published',
  POSTPONED: 'postponed',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
})

export const COMPANY_PHASE_TYPES = Object.freeze([
  'assessment',
  'group_discussion',
  'technical_interview',
  'hr_interview',
  'other',
])

export const PHASE_EXECUTION_STATUSES = Object.freeze(['unscheduled', 'scheduled', 'live', 'completed', 'skipped', 'cancelled'])
export const PHASE_EXECUTION_MODES = Object.freeze(['online', 'offline', 'hybrid'])
export const PHASE_RESOURCE_TYPES = Object.freeze(['test_link', 'form', 'meeting_link', 'whatsapp', 'other'])
