import { z } from 'zod'

const objectId = label => z.string().regex(/^[a-f\d]{24}$/i, `${label} must be valid.`)
const categories = ['withdrawal', 'absent', 'cheating', 'misconduct', 'rule_violation', 'document_or_information_issue', 'other']

export const incidentReportCreateSchema = z.object({
  applicationId: objectId('Application ID'),
  category: z.enum(categories),
  description: z.string().trim().min(2, 'Reason must contain at least 2 characters.').max(1500),
  note: z.string().trim().max(1500).optional(),
})

export const incidentIdParamsSchema = z.object({ id: objectId('Incident report ID') })
export const restrictionIdParamsSchema = z.object({ id: objectId('Restriction ID') })

export const incidentReviewSchema = z.object({
  action: z.enum(['no_action', 'warning_only', 'temporary_restriction', 'permanent_restriction', 'refer_to_department']),
  reviewNote: z.string().trim().min(2, 'Admin review note must contain at least 2 characters.').max(1500),
  driveCount: z.coerce.number().int().min(1).max(100).optional(),
}).superRefine((value, context) => {
  if (['temporary_restriction', 'permanent_restriction'].includes(value.action) && value.reviewNote.length > 500) context.addIssue({ code: 'custom', path: ['reviewNote'], message: 'Restriction notes must contain at most 500 characters.' })
  if (value.action === 'temporary_restriction' && !value.driveCount) context.addIssue({ code: 'custom', path: ['driveCount'], message: 'Choose the number of future Placement Drives for this restriction.' })
  if (value.action !== 'temporary_restriction' && value.driveCount != null) context.addIssue({ code: 'custom', path: ['driveCount'], message: 'Drive count is only allowed for a temporary restriction.' })
})

export const restrictionImpositionSchema = z.object({
  type: z.enum(['temporary_drive_count', 'permanent']),
  reason: z.string().trim().min(2, 'Restriction reason must contain at least 2 characters.').max(500),
  driveCount: z.coerce.number().int().min(1).max(100).optional(),
}).superRefine((value, context) => {
  if (value.type === 'temporary_drive_count' && !value.driveCount) context.addIssue({ code: 'custom', path: ['driveCount'], message: 'Choose the number of future Placement Drives for this restriction.' })
  if (value.type !== 'temporary_drive_count' && value.driveCount != null) context.addIssue({ code: 'custom', path: ['driveCount'], message: 'Drive count is only allowed for a temporary restriction.' })
})

export const restrictionRemovalSchema = z.object({ removalReason: z.string().trim().min(2, 'Removal reason must contain at least 2 characters.').max(1000) })
