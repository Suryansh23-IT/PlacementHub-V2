import { z } from 'zod'

const note = max => z.string().trim().min(2, 'Enter a reason with at least 2 characters.').max(max, `Use at most ${max} characters.`)
const count = z.coerce.number().int().min(1).max(100)
export const reviewFormSchema = z.object({
  action: z.enum(['no_action', 'warning_only', 'temporary_restriction', 'permanent_restriction', 'refer_to_department']),
  reviewNote: note(1500),
  driveCount: z.string(),
}).superRefine((value, context) => {
  if (value.action.endsWith('_restriction') && value.reviewNote.length > 500) context.addIssue({ code: 'custom', message: 'Restriction notes must contain at most 500 characters.' })
  if (value.action === 'temporary_restriction' && !count.safeParse(value.driveCount).success) context.addIssue({ code: 'custom', message: 'Choose a whole number of future drives from 1 to 100.' })
})
export const restrictionFormSchema = z.object({ type: z.enum(['temporary_drive_count', 'permanent']), reason: note(500), driveCount: z.string() }).superRefine((value, context) => {
  if (value.type === 'temporary_drive_count' && !count.safeParse(value.driveCount).success) context.addIssue({ code: 'custom', message: 'Choose a whole number of future drives from 1 to 100.' })
})
export const removalFormSchema = note(1000)
