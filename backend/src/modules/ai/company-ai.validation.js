import { z } from 'zod'
import { contextualQuestionSchema } from './ai-question.js'
const id = z.string().regex(/^[a-f0-9]{24}$/i)
export const companyAiParams = z.object({ driveId: id, studentId: id.optional(), jobId: z.string().uuid().optional() })
export const companyBatchBody = z.strictObject({ studentIds: z.array(id).min(1).max(20).refine(ids => new Set(ids).size === ids.length, 'Select each candidate once.') })
export const companyOverviewBody = z.strictObject({ candidates: z.array(z.strictObject({ driveId: id, studentId: id })).max(100) })
export { contextualQuestionSchema }
