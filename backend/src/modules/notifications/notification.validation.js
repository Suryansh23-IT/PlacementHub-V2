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
