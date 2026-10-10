import {z} from 'zod'
import {AiProviderError} from './ai.errors.js'
const refs = z.array(z.string().min(1).max(60)).min(1).max(3)
const item = z.strictObject({text:z.string().trim().min(1).max(240),evidenceRefs:refs})
export const adminInsightSchema = z.strictObject({summary:z.string().trim().min(1).max(400),evidenceRefs:refs,highlights:z.array(item).max(2),concerns:z.array(item).max(2),recommendations:z.array(item).max(2)})
export const adminAnswerSchema = z.strictObject({answer:z.string().trim().min(1).max(1600),evidenceRefs:refs})
const unsafe = /(?:\bdb\.|\$lookup|\$where|\b(?:insertOne|deleteMany|updateMany|findOne|mongo(?:db|sh)?|eval)\s*\(|```|\b(?:gender|mbti|personality|hobbies)\b)/i
function validateGrounded(value,context,schema) {
  const result=schema.safeParse(value)
  if(!result.success)throw new AiProviderError('invalid_output')
  const known=new Map(context.evidence.map(row=>[row.id,row.data]))
  const parts = 'answer' in result.data ? [{text:result.data.answer,evidenceRefs:result.data.evidenceRefs}] : [{text:result.data.summary,evidenceRefs:result.data.evidenceRefs},...result.data.highlights,...result.data.concerns,...result.data.recommendations]
  for(const part of parts){
    if('answer' in result.data&&/\b(?:stalled|stagnant|delayed)\b/i.test(part.text)&&!/\b(?:possible|may|might|potential)\b/i.test(part.text)){console.warn('Admin AI rejected an unsupported timing inference.');throw new AiProviderError('invalid_evidence')}
    if(unsafe.test(part.text)){console.warn('Admin AI rejected prohibited content.');throw new AiProviderError('invalid_evidence')}
    if(part.evidenceRefs.some(ref=>!known.has(ref))){console.warn('Admin AI rejected an unknown fact reference.');throw new AiProviderError('invalid_evidence')}
    // Referential validation is augmented with numeric grounding; it is not semantic proof.
    const numbers=new Set(['2027']);const collect=value=>{if(typeof value==='number'){numbers.add(String(value));numbers.add(value.toFixed(1));numbers.add(String(Math.round(value)))}else if(typeof value==='string'){for(const number of value.match(/\b\d+(?:\.\d+)?\b/g)??[])numbers.add(number)}else if(value&&typeof value==='object')Object.values(value).forEach(collect)}
    part.evidenceRefs.forEach(ref=>collect(known.get(ref)))
    const words={zero:'0',one:'1',two:'2',three:'3',four:'4',five:'5',six:'6',seven:'7',eight:'8',nine:'9',ten:'10'}
    const tokens=[...(part.text.match(/\b\d+(?:\.\d+)?\b/g)??[]),...(part.text.toLowerCase().match(/\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten)\b/g)??[]).map(word=>words[word])]
    for(const token of tokens)if(!numbers.has(token)){console.warn('Admin AI rejected an unsupported numeric claim.');throw new AiProviderError('invalid_evidence')}
  }
  return result.data
}
const instructions='Use only supplied aggregate analytics facts for factual claims. No DB commands/tools, individual students, forecasts or hiring decisions. General operational advice is allowed, explicitly as recommendations. Missing metrics are not documented. Do not invent numbers, companies or drives. Cite the exact supplied evidence IDs in evidenceRefs. Keep each text ONE short sentence under 20 words/150 characters, summary under 30 words/220 characters. Return at most ONE highlight, ONE concern and ONE recommendation. Prefer qualitative interpretation: deterministic metrics are already displayed; do not repeat numeric values unless essential and supported by the cited facts. Begin with "Based on the current PlacementHub data". No overall score.'
export const adminInsightContract={version:'admin-insight-3',jsonSchema:z.toJSONSchema(adminInsightSchema),instruction:`${instructions} Do not count groups of branches/companies unless the cited aggregate fact explicitly provides that count; avoid numeric group counts otherwise.`,validate:(value,context)=>validateGrounded(value,context,adminInsightSchema)}
export const adminAnswerContract={version:'admin-answer-4',jsonSchema:z.toJSONSchema(adminAnswerSchema),instruction:`${instructions} Answer only the current question in under 80 words. Do not invent group counts. Current phase statuses are snapshots, not proof of stalled/delayed progress or causes. No timing metric is supplied. Phrase operational recommendations as conditional advice: consider/may help.`,validate:(value,context)=>validateGrounded(value,context,adminAnswerSchema)}
export function constrainAdminContract(contract,context){
  const jsonSchema=structuredClone(contract.jsonSchema);const ids=context.evidence.map(row=>row.id)
  const visit=node=>{if(!node||typeof node!=='object')return;if(node.properties?.evidenceRefs)node.properties.evidenceRefs.items={type:'string',enum:ids};Object.values(node).forEach(visit)}
  visit(jsonSchema);return {...contract,jsonSchema}
}
