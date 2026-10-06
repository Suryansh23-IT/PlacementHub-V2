import { z } from 'zod'

export const notificationIdParamsSchema = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i, 'Notification ID must be valid.') })
const objectId = label => z.string().regex(/^[a-f\d]{24}$/i, `${label} must be valid.`)
const messageFields = z.object({ title: z.string().trim().min(2, 'Title must contain at least 2 characters.').max(160), message: z.string().trim().min(2, 'Message must contain at least 2 characters.').max(1500) })

export const adminStudentNotificationSchema = messageFields.extend({
  audience: z.enum(['all_verified', 'eligible_drive', 'drive_applicants']),
  placementDriveId: objectId('Placement Drive ID').optional(),
}).superRefine((value, context) => {
  if (value.audience !== 'all_verified' && !value.placementDriveId) context.addIssue({ code: 'custom', path: ['placementDriveId'], message: 'Select a published Placement Drive for this audience.' })
  if (value.audience === 'all_verified' && value.placementDriveId) context.addIssue({ code: 'custom', path: ['placementDriveId'], message: 'A Placement Drive is only allowed for a drive-specific audience.' })
})

export const adminCompanyNotificationParamsSchema = z.object({ companyUserId: objectId('Company account ID') })
export const adminCompanyNotificationSchema = messageFields.extend({ placementDriveId: objectId('Placement Drive ID').optional() })
export const companyAdminNotificationSchema = messageFields.extend({ placementDriveId: objectId('Placement Drive ID').optional() })
export const companyDriveApplicantsNotificationSchema = messageFields.extend({ placementDriveId: objectId('Placement Drive ID') })
export const companyPhaseCandidatesNotificationSchema = messageFields.extend({
  placementDriveId: objectId('Placement Drive ID'),
  phaseNumber: z.coerce.number().int().min(1).max(5),
  requestId: z.string().uuid('Request ID must be a UUID.'),
})

export const notificationListQuerySchema = z.object({
  state: z.enum(['all', 'unread', 'read']).default('all'),
  category: z.enum(['all', 'recruitment', 'placement', 'system']).default('all'),
  search: z.string().trim().max(160).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  drive: z.string().optional(), phase: z.coerce.number().int().min(1).max(5).optional(), targetType: z.string().trim().max(80).optional(),
  dateFrom: z.coerce.date().optional(), dateTo: z.coerce.date().optional(),
})
export const companyTargetSchema = messageFields.extend({ placementDriveId: objectId('Placement Drive ID'), target: z.enum(['all_applicants', 'active', 'phase', 'selected', 'specific']), phaseNumber: z.coerce.number().int().min(1).max(5).optional(), selectedApplicationIds: z.array(objectId('Application ID')).max(2000).optional(), requestId: z.string().uuid('Request ID must be a UUID.') }).superRefine((value, context) => { if (value.target === 'phase' && !value.phaseNumber) context.addIssue({ code: 'custom', path: ['phaseNumber'], message: 'Choose a phase.' }); if (value.target === 'specific' && !value.selectedApplicationIds?.length) context.addIssue({ code: 'custom', path: ['selectedApplicationIds'], message: 'Select at least one candidate.' }) })
export const explorerTargetSchema = messageFields.extend({
  mode: z.enum(['selected', 'all_matching']),
  selectedStudentIds: z.array(objectId('Student ID')).max(2000).optional(),
  filters: z.record(z.string(), z.unknown()).default({}),
  requestId: z.string().uuid('Request ID must be a UUID.'),
}).superRefine((value, context) => { if (value.mode === 'selected' && !value.selectedStudentIds?.length) context.addIssue({ code: 'custom', path: ['selectedStudentIds'], message: 'Select at least one Student.' }) })
