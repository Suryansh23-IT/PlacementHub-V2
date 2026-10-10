import { z } from 'zod'
import { analysisSchema, validateAnalysis } from './ai.schemas.js'
import { AiProviderError } from './ai.errors.js'

const suggestions = z.array(z.string().trim().min(1).max(300)).max(5)
const careerSchema = analysisSchema.extend({ suitableRoles: suggestions, nextLearningSteps: suggestions, profileSuggestions: suggestions })
export const careerContract = {
  version: 'career-1', jsonSchema: z.toJSONSchema(careerSchema),
  instruction: 'The supplied deterministic score is fixed. Recommend suitableRoles only from deterministic.suitableRoles. Suggest nextLearningSteps and profileSuggestions. Resume text is unavailable: never claim PDF wording or ATS analysis. Do not output a score or eligibility decision.',
  validate(value, context) {
    const result = careerSchema.safeParse(value)
    if (!result.success) throw new AiProviderError('invalid_output')
    const { suitableRoles, nextLearningSteps, profileSuggestions, ...base } = result.data
    validateAnalysis(base, context.evidence.map(entry => entry.id))
    if (suitableRoles.some(role => !context.deterministic.suitableRoles.includes(role))) throw new AiProviderError('invalid_evidence')
    return { ...base, suitableRoles, nextLearningSteps, profileSuggestions }
  },
}
export const matchContract = {
  version: 'student-match-1', jsonSchema: z.toJSONSchema(analysisSchema),
  instruction: 'Explain the fixed deterministic professional match, matched skills, missing skills and weak evidence. Missing evidence means not documented, not inability. Eligibility is separate and not provided: never assert eligibility or alter decisions. Give a brief advisory recommendation. Do not output a score.',
  validate: (value, context) => validateAnalysis(value, context.evidence.map(entry => entry.id)),
}
