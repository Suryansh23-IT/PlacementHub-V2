import { z } from 'zod'
import { AiProviderError } from './ai.errors.js'

const item = z.strictObject({ text: z.string().trim().min(1).max(400), evidenceIds: z.array(z.string().min(1).max(100)).max(10) })
export const analysisSchema = z.strictObject({
  summary: z.string().trim().min(1).max(800),
  strengths: z.array(item).max(6),
  gaps: z.array(item).max(6),
  recommendations: z.array(item).max(6),
})
export const analysisJsonSchema = z.toJSONSchema(analysisSchema)

// Constrain generation as well as validating afterwards. Section checks remain
// authoritative; this only limits references to the current evidence.
export function constrainEvidenceSchema(schema, context) {
  const result = structuredClone(schema)
  const ids = context.evidence.map(row => row.id)
  function visit(node) {
    if (!node || typeof node !== 'object') return
    if (node.properties?.evidenceIds) {
      if (ids.length) node.properties.evidenceIds.items = { type: 'string', enum: ids }
      else node.properties.evidenceIds.maxItems = 0
    }
    for (const child of Object.values(node)) if (typeof child === 'object') visit(child)
  }
  visit(result)
  return result
}

export function validateAnalysis(value, evidenceIds = []) {
  const result = analysisSchema.safeParse(value)
  if (!result.success) throw new AiProviderError('invalid_output')
  const allowed = new Set(evidenceIds)
  if (result.data.strengths.some(entry => entry.evidenceIds.length === 0)) throw new AiProviderError('invalid_evidence')
  for (const entry of [...result.data.strengths, ...result.data.gaps, ...result.data.recommendations]) {
    if (entry.evidenceIds.some(id => !allowed.has(id))) throw new AiProviderError('invalid_evidence')
  }
  return result.data
}
