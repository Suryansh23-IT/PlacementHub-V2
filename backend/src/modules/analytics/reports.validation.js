import { z } from 'zod'
import { analyticsFilterSchema } from './analytics.validation.js'

export const reportTypeSchema = z.enum(['student_master', 'eligible_students', 'ineligible_students', 'unplaced_eligible', 'placed_students', 'placement_summary', 'branch_summary', 'outcomes', 'package_report', 'company_summary', 'company_selections', 'recruitment_history', 'complete_drive', 'phase_wise_drive', 'selected_candidates', 'final_confirmed', 'monthly_placement'])
export const adminReportQuerySchema = analyticsFilterSchema.extend({
  type: reportTypeSchema,
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
}).superRefine((value, context) => {
  if (['complete_drive', 'phase_wise_drive', 'selected_candidates', 'final_confirmed'].includes(value.type) && !value.drive) context.addIssue({ code: 'custom', path: ['drive'], message: 'A drive is required for this report.' })
  if (value.type === 'monthly_placement' && (!value.month || !value.year) && (!value.dateFrom || !value.dateTo)) context.addIssue({ code: 'custom', path: ['month'], message: 'Choose a month and year or a custom date range.' })
})
