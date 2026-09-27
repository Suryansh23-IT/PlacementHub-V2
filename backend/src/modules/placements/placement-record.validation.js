import { z } from 'zod'
const id = z.string().regex(/^[a-f\d]{24}$/i, 'ID must be valid.')
const text = max => z.string().trim().max(max).optional().transform(value => value || undefined)
export const placementRecordParamsSchema = z.object({ id })
export const placementProofParamsSchema = z.object({ id, proofIndex: z.coerce.number().int().min(0) })
export const placementReportSchema = z.object({ outcomeType: z.enum(['full_time', 'internship', 'ppo', 'internship_and_ppo']), package: z.object({ amount: z.coerce.number().min(0).optional(), currency: text(10), period: z.enum(['per_annum', 'per_month', 'not_disclosed']).optional() }).optional(), stipend: z.object({ amount: z.coerce.number().min(0).optional(), currency: text(10), period: z.enum(['per_month', 'not_disclosed']).optional() }).optional(), location: text(300), joiningPeriod: text(200), notes: text(1500) })
export const placementDecisionSchema = z.object({ reason: z.string().trim().min(2).max(1500), corrections: placementReportSchema.partial().optional() })
