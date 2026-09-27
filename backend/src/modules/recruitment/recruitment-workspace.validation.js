import { z } from 'zod'
import { APPLICATION_STATUSES } from '../applications/application.constants.js'
import { PHASE_EXECUTION_MODES, PHASE_EXECUTION_STATUSES, PHASE_RESOURCE_TYPES } from '../placement-drives/placement-drive.constants.js'
import { recruitmentTransitionSchema } from './recruitment-transition.validation.js'

const objectId = label => z.string().regex(/^[a-f\d]{24}$/i, `${label} must be valid.`)
const optionalText = max => z.string().trim().max(max).optional().transform(value => value || undefined)
const phaseNumber = z.coerce.number().int().min(1).max(5)
const externalUrl = z.string().url().max(2000).refine(value => /^https?:\/\//i.test(value), 'Resource URLs must use http or https.')

export const recruitmentDriveParamsSchema = z.object({ id: objectId('Placement Drive ID') })
export const recruitmentCandidateParamsSchema = recruitmentDriveParamsSchema.extend({ applicationId: objectId('Application ID') })
export const recruitmentPhaseParamsSchema = recruitmentDriveParamsSchema.extend({ phaseNumber })
export const recruitmentCandidateQuerySchema = z.object({ phase: z.coerce.number().int().min(0).max(5).optional(), status: z.enum(APPLICATION_STATUSES).optional() })
export const recruitmentCandidateExportQuerySchema = z.object({
  phase: z.coerce.number().int().min(0).max(5).optional(),
  selectedOnly: z.enum(['true', 'false']).optional().transform(value => value === 'true'),
}).superRefine((value, context) => {
  if (value.phase == null && !value.selectedOnly) context.addIssue({ code: 'custom', path: ['phase'], message: 'Choose a phase or the provisional selected pool to export.' })
  if (value.phase != null && value.selectedOnly) context.addIssue({ code: 'custom', path: ['selectedOnly'], message: 'Choose either a phase or the provisional selected pool.' })
})
export const phaseExecutionUpdateSchema = z.object({
  scheduledAt: z.coerce.date().optional(),
  deadlineAt: z.coerce.date().optional(),
  mode: z.enum(PHASE_EXECUTION_MODES).optional(),
  venue: optionalText(300),
  instructions: optionalText(3000),
  resources: z.array(z.object({ type: z.enum(PHASE_RESOURCE_TYPES), label: optionalText(120), url: externalUrl })).max(20).optional(),
  status: z.enum(PHASE_EXECUTION_STATUSES).optional(),
}).superRefine((value, context) => {
  if (value.scheduledAt && value.deadlineAt && value.deadlineAt < value.scheduledAt) context.addIssue({ code: 'custom', path: ['deadlineAt'], message: 'The phase deadline must be after its scheduled time.' })
})

export const bulkRecruitmentTransitionSchema = z.object({
  applicationIds: z.array(objectId('Application ID')).min(1).max(100),
  transition: recruitmentTransitionSchema,
}).superRefine((value, context) => {
  if (new Set(value.applicationIds).size !== value.applicationIds.length) context.addIssue({ code: 'custom', path: ['applicationIds'], message: 'Choose each candidate only once.' })
})

export { recruitmentTransitionSchema }
