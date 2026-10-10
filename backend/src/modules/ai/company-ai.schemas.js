import { z } from 'zod'
import { qualityContract } from './student-ai.assessment.js'
import { AiProviderError } from './ai.errors.js'

const evidenceItem = z.strictObject({ text: z.string().trim().min(1).max(180), evidenceIds: z.array(z.string().max(80)).min(1).max(3) })
const section = z.strictObject({ key: z.enum(['projects', 'experience', 'roleEvidence']), rating: z.number().int().min(0).max(4), reason: z.string().trim().min(1).max(200), evidenceIds: z.array(z.string().min(1).max(80)).max(4) })
const schema = z.strictObject({ sections: z.array(section).length(3), summary: z.string().trim().min(1).max(500), strengths: z.array(evidenceItem).max(2), gaps: z.array(z.string().trim().min(1).max(160)).max(2), interviewerFocus: z.array(z.string().trim().min(1).max(160)).max(2) })
export const companyFitContract = {
  version: 'company-fit-4', jsonSchema: z.toJSONSchema(schema, { target: 'draft-7' }),
  instruction: `${qualityContract(true).instruction} Assess the supplied drive.title as the hiring role; targetRole is the student's aspiration, not the current job. Start summary with "Based on the documented evidence available". STRICT brevity: each reason is ONE sentence, at most 15 words and 120 characters. Summary at most 40 words and 350 characters. Include at most two strengths with references, two not-documented gaps and two interview questions, each at most 15 words and 120 characters. Treat absent documentation as unknown. No hiring decision or ranking by personal attributes.`,
  validate(value, context) {
    const result = schema.safeParse(value)
    if (!result.success) {
      console.warn('Candidate AI schema validation:', result.error.issues.map(issue => ({ path: issue.path.join('.'), code: issue.code })))
      throw new AiProviderError('invalid_output')
    }
    const { strengths, gaps, interviewerFocus, ...base } = result.data
    qualityContract(true).validate(base, context)
    const known = new Set(context.evidence.map(row => row.id))
    if (strengths.some(row => row.evidenceIds.some(id => !known.has(id)))) throw new AiProviderError('invalid_evidence')
    return { ...base, strengths, gaps: gaps.map(text => /\bdocument(?:ed|ation)?\b/i.test(text) ? text : `Not documented in available evidence: ${text.replace(/^missing\s+/i, '')}`), interviewerFocus }
  },
}
export function groupQuestionContract(candidateIds) {
  const schema = z.strictObject({ answer: z.string().trim().min(1).max(2400), candidateIds: z.array(z.enum(candidateIds)).min(1).max(candidateIds.length) })
  return { version: 'company-group-2', jsonSchema: z.toJSONSchema(schema), instruction: 'Answer one group question using ONLY the compact candidates supplied. Start "Based on the documented evidence available". Cite candidate names/IDs in the answer and list the candidateIds actually discussed. General interview advice is allowed. Missing evidence is not documented, not inability. This shortlist is retrieved from structured professional evidence and cached resume excerpts; never claim exhaustive resume search or an objectively best person. Keep answer under 120 words. Never compare academic grades, CPI/CGPA/GPA, branch, gender or personal attributes. No hiring/eligibility decisions, tools or queries.', validate(output) { const parsed = schema.safeParse(output); if (!parsed.success || /\b(?:eligible|ineligible|eligibility|cgpa|cpi|gpa|academic grades?|gender|branch)\b/i.test(parsed.data.answer)) throw new AiProviderError('invalid_evidence'); return parsed.data } }
}
