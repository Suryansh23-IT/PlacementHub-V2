import { z } from 'zod'
import { AiProviderError } from './ai.errors.js'
import { fingerprint } from './ai.context.js'

export const ASSESSMENT_VERSION = 'independent-rubric-1'
const careerWeights = { skills: 20, projects: 25, experience: 15, credentials: 10, direction: 15, introduction: 15 }
const matchWeights = { projects: 40, experience: 30, roleEvidence: 30 }
const labels = { skills: 'Technical depth', projects: 'Project quality', experience: 'Experience relevance', credentials: 'Credential evidence', direction: 'Career alignment', introduction: 'Professional presentation', roleEvidence: 'Role evidence quality' }
const types = { skills: ['skill', 'project', 'experience', 'resume'], projects: ['project', 'resume'], experience: ['experience', 'resume'], credentials: ['certification', 'achievement', 'resume'], direction: ['direction', 'resume'], introduction: ['introduction', 'resume'], roleEvidence: ['project', 'experience', 'resume'] }

export function qualityContext(context) {
  const evidence = [...context.evidence]
  for (const [type, data] of [['direction', { targetRole: context.targetRole, careerInterests: context.careerInterests }], ['introduction', { headline: context.professionalHeadline, about: context.about }]]) {
    if (Object.values(data).some(value => Array.isArray(value) ? value.length : value)) evidence.push({ id: `${type}:${fingerprint(data).slice(0, 24)}`, type, data })
  }
  const weights = context.kind === 'match' ? matchWeights : careerWeights
  return { ...context, evidence, qualitySections: Object.keys(weights).map(key => ({ key, maximum: weights[key], evidenceIds: evidence.filter(row => types[key].includes(row.type)).map(row => row.id) })) }
}

export function qualityContract(match = false) {
  const keys = Object.keys(match ? matchWeights : careerWeights)
  const schema = z.strictObject({ sections: z.array(z.strictObject({ key: z.enum(keys), rating: z.number().int().min(0).max(4), reason: z.string().trim().min(1).max(200), evidenceIds: z.array(z.string().min(1).max(80)).max(4) })).length(keys.length), summary: z.string().trim().min(1).max(500) })
  return {
    version: `${ASSESSMENT_VERSION}-${match ? 'match' : 'career'}`, jsonSchema: z.toJSONSchema(schema, { target: 'draft-7' }),
    instruction: `Give an independent semantic assessment, NOT an adjustment/blend of the objective score. Fixed rubric: 0=no documented relevant evidence; 1=vague evidence; 2=basic relevance; 3=specific relevant work; 4=strong technical depth with concrete documented outcomes. Return every qualitySections key exactly once. Each positive rating must cite that section's allowed evidenceIds. A resume reference supports ONLY claims actually present in its excerpt, not every section automatically. If work/credentials are absent in both profile and resume, rating MUST be zero. Skills alone cannot prove completed work. Reasons: one short sentence grounded in cited evidence, missing evidence described as not documented. ${match ? 'Evaluate ONLY projects, experience and professional work against role/description and stored company facts. Published eligibilityCriteria is background for the normal placement system, NOT scoring evidence. Do not mention or evaluate eligibility, CGPA, grades, branch, or graduation criteria in any assessment text. NEVER say candidate meets eligibility. Do not invent company practices.' : 'Evaluate technical depth, projects, experience, credentials, career alignment and professional presentation using profile and extracted resume where available.'} General recommendations may use professional knowledge. No invented evidence, final score, eligibility or decisions.`,
    validate(output, context) {
      const parsed = schema.safeParse(output)
      if (!parsed.success || new Set(parsed.data.sections.map(row => row.key)).size !== keys.length) throw new AiProviderError('invalid_output')
      if (match && /\b(?:eligible|ineligible|eligibility|cgpa|cpi|gpa|academic grades?)\b/i.test([parsed.data.summary, ...parsed.data.sections.map(row => row.reason)].join(' '))) throw new AiProviderError('invalid_evidence')
      for (const row of parsed.data.sections) {
        const section = context.qualitySections.find(item => item.key === row.key)
        if (row.evidenceIds.some(id => !section.evidenceIds.includes(id)) || row.rating > 0 && !row.evidenceIds.length) throw new AiProviderError('invalid_evidence')
      }
      return parsed.data
    },
  }
}

export function assessmentScore(analysis, match = false) {
  const weights = match ? matchWeights : careerWeights
  const sections = analysis.sections.map(row => ({ ...row, label: labels[row.key], maximum: weights[row.key], points: weights[row.key] * row.rating / 4 }))
  const score = Math.round(sections.reduce((sum, row) => sum + row.points, 0))
  sections.forEach(row => { row.earnedPoints = Math.floor(row.points) })
  const remainder = score - sections.reduce((sum, row) => sum + row.earnedPoints, 0)
  const order = [...sections].sort((a, b) => b.points % 1 - a.points % 1)
  order.slice(0, remainder).forEach(row => { row.earnedPoints++ })
  return { score, sections, summary: analysis.summary }
}
