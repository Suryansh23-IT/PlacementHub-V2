import { z } from 'zod'
import { analyticsFilterSchema } from '../analytics/analytics.validation.js'
export const studentExplorerQuerySchema = analyticsFilterSchema.safeExtend({ backlog: z.enum(['zero', 'has_backlog']).optional(), placementSource: z.enum(['ON_CAMPUS', 'OFF_CAMPUS']).optional(), phase: z.coerce.number().int().min(0).max(5).optional(), applicationStatus: z.string().trim().max(60).optional() })

// Reuse the complete, refined Explorer query schema. Zod intentionally does
// not permit .omit() on schemas with cross-field refinements.
const explorerFilters = studentExplorerQuerySchema
const studentId = z.string().regex(/^[a-f\d]{24}$/i, 'Student ID must be valid.')

export const studentExplorerExportSchema = z.object({
  mode: z.enum(['selected', 'current_view', 'all_matching']),
  selectedStudentIds: z.array(studentId).max(2000).optional(),
  filters: explorerFilters.default({}),
}).superRefine((value, context) => {
  if (value.mode === 'selected' && !(value.selectedStudentIds?.length)) context.addIssue({ code: 'custom', path: ['selectedStudentIds'], message: 'Select at least one student.' })
})

export const studentExplorerNotificationSchema = studentExplorerExportSchema.extend({
  title: z.string().trim().min(2).max(160),
  message: z.string().trim().min(2).max(1500),
  requestId: z.string().uuid().optional(),
})
