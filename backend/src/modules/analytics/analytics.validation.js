import { z } from 'zod'

const optionalText = z.string().trim().min(1).optional()
const optionalDate = z.coerce.date().optional()

// This vocabulary is intentionally shared by later explorers and exports. M8A's
// summary uses the filters that have a meaningful aggregate interpretation.
export const analyticsFilterSchema = z.object({
  batch: z.coerce.number().int().min(2000).max(2100).optional(),
  graduationYear: z.coerce.number().int().min(2000).max(2100).optional(),
  dateFrom: optionalDate,
  dateTo: optionalDate,
  branch: optionalText,
  company: optionalText,
  drive: optionalText,
  minCpi: z.coerce.number().min(0).max(10).optional(),
  maxCpi: z.coerce.number().min(0).max(10).optional(),
  collegeEligibility: z.enum(['eligible', 'ineligible']).optional(),
  placementStatus: z.enum(['placed', 'unplaced', 'offer_received', 'confirmation_pending', 'unplaced_eligible']).optional(),
  outcomeType: z.enum(['full_time', 'internship', 'ppo', 'internship_and_ppo']).optional(),
  placementSource: z.enum(['ON_CAMPUS', 'OFF_CAMPUS']).optional(),
  verificationStatus: z.enum(['pending', 'verified', 'rejected']).optional(),
  search: z.string().trim().max(120).optional(),
  sortBy: z.enum(['name', 'cgpa', 'branch', 'placement_status', 'activity']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  groupBy: z.enum(['branch', 'placement_status', 'company', 'outcome']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).superRefine((value, context) => {
  if (value.minCpi != null && value.maxCpi != null && value.minCpi > value.maxCpi) context.addIssue({ code: 'custom', path: ['maxCpi'], message: 'Maximum CPI must be at least the minimum CPI.' })
  if (value.dateFrom && value.dateTo && value.dateFrom > value.dateTo) context.addIssue({ code: 'custom', path: ['dateTo'], message: 'End date must not be before start date.' })
})
