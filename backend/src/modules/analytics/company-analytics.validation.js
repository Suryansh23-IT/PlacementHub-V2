import { z } from 'zod'
import { APPLICATION_STATUSES } from '../applications/application.constants.js'

const optionalText = z.string().trim().min(1).optional()
export const companyCandidateQuerySchema = z.object({
  search: z.string().trim().max(120).optional(), drive: optionalText, branch: optionalText,
  minCpi: z.coerce.number().min(0).max(10).optional(), maxCpi: z.coerce.number().min(0).max(10).optional(),
  phase: z.coerce.number().int().min(0).max(5).optional(), status: z.enum(APPLICATION_STATUSES).optional(),
  confirmationStatus: z.enum(['selected_report_not_submitted', 'pending_admin_verification', 'confirmed', 'rejected', 'revoked']).optional(),
  outcomeType: z.enum(['full_time', 'internship', 'ppo', 'internship_and_ppo']).optional(),
  graduationYear: z.coerce.number().int().min(2000).max(2100).optional(), backlog: z.enum(['zero', 'has_backlog']).optional(),
  sortBy: z.enum(['name', 'cgpa', 'branch', 'phase', 'status', 'activity']).optional(), sortOrder: z.enum(['asc', 'desc']).optional(),
  groupBy: z.enum(['branch', 'phase', 'status']).optional(), exportMode: z.enum(['current_view', 'all_matching']).optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(50),
}).superRefine((value, context) => { if (value.minCpi != null && value.maxCpi != null && value.minCpi > value.maxCpi) context.addIssue({ code: 'custom', path: ['maxCpi'], message: 'Maximum CPI must be at least the minimum CPI.' }) })
