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
    if(!('answer' in result.data)&&/\b(?:branches?|streams?|engineering)\b/i.test(part.text)&&/\b(?:active|inactive|reactivat\w*)\b/i.test(part.text)&&/\bdrives?\b/i.test(part.text)){console.warn('Admin AI rejected unsupported branch-specific drive activity.');throw new AiProviderError('invalid_evidence')}
    if(!('answer' in result.data)&&!context.evidence.some(row=>row.id.startsWith('branch:'))&&/\b(?:branches?|streams?|engineering|drives?)\b/i.test(part.text)){console.warn('Admin AI rejected a claim outside the correction cohort scope.');throw new AiProviderError('invalid_evidence')}
    if(unsafe.test(part.text)){console.warn('Admin AI rejected prohibited content.');throw new AiProviderError('invalid_evidence')}
    if(part.evidenceRefs.some(ref=>!known.has(ref))){console.warn('Admin AI rejected an unknown fact reference.');throw new AiProviderError('invalid_evidence')}
    // Referential validation is augmented with numeric grounding; it is not semantic proof.
    const numbers=new Set(['2027']);const collect=value=>{if(typeof value==='number'){numbers.add(String(value));numbers.add(value.toFixed(1));numbers.add(String(Math.round(value)))}else if(typeof value==='string'){for(const number of value.match(/\b\d+(?:\.\d+)?\b/g)??[])numbers.add(number)}else if(value&&typeof value==='object')Object.values(value).forEach(collect)}
    part.evidenceRefs.forEach(ref=>collect(known.get(ref)))
    const words={zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90}
    // Match a compound cardinal as ONE quantity ("fifty-eight" is 58, not 8).
    // Every parsed quantity still must occur in its cited trusted facts.
    const spelled=part.text.toLowerCase().match(/\b(?:(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[-–‑\s]+(?:one|two|three|four|five|six|seven|eight|nine))?|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)\b/g)??[]
    const tokens=[...(part.text.match(/\b\d+(?:\.\d+)?\b/g)??[]),...spelled.map(value=>String(value.split(/[-–‑\s]+/).reduce((sum,word)=>sum+words[word],0)))]
    for(const token of tokens)if(!numbers.has(token)){console.warn('Admin AI rejected an unsupported numeric claim.');throw new AiProviderError('invalid_evidence')}
  }
  return result.data
}
const instructions='Use only supplied aggregate analytics facts for factual claims. No DB commands/tools, individual students, forecasts or hiring decisions. General operational advice is allowed, explicitly as recommendations. Missing metrics are not documented. Do not invent numbers, companies or drives. Cite the exact supplied evidence IDs in evidenceRefs. Keep each text ONE short sentence under 20 words/150 characters, summary under 30 words/220 characters. Return at most ONE highlight, ONE concern and ONE recommendation. Prefer qualitative interpretation: deterministic metrics are already displayed; do not repeat numeric values unless essential and supported by the cited facts. Begin with "Based on the current PlacementHub data". No overall score.'
export const adminInsightContract={version:'admin-insight-9',jsonSchema:z.toJSONSchema(adminInsightSchema),instruction:`${instructions} Copy the schema's exact summary and cite only summary for it. Each observation must cite the fact supplying EVERY number or claim in that sentence. Group counts require operations, never individual branch references. Do not infer branch-specific active drives from institution totals. Return exactly ONE useful highlight, ONE concern and ONE conditional recommendation. Keep observation prose qualitative without numerals or written number counts. Use branch evidence only for recorded placement performance, never drive activity. Do not leave sections empty or repeat the count summary as analysis.`,validationRetryInstruction:'The first response failed schema/evidence validation. Return corrected JSON using ONLY the supplied current cohort facts. Copy the exact summary constant and cite summary. Return exactly one concise qualitative highlight about confirmed placements, one concern about the remaining unplaced eligible cohort, and one conditional recommendation for supporting that cohort. Use summary for all evidence references. Observation prose must contain no numbers, percentages, numbered lists or invented causes. Empty arrays are invalid. No commands, tools, individual decisions or unsupported claims.',validate:(value,context)=>validateGrounded(value,context,adminInsightSchema)}
export const adminAnswerContract={version:'admin-answer-4',jsonSchema:z.toJSONSchema(adminAnswerSchema),instruction:`${instructions} Answer only the current question in under 80 words. Do not invent group counts. Current phase statuses are snapshots, not proof of stalled/delayed progress or causes. No timing metric is supplied. Phrase operational recommendations as conditional advice: consider/may help.`,validate:(value,context)=>validateGrounded(value,context,adminAnswerSchema)}
export function constrainAdminContract(contract,context){
  const jsonSchema=structuredClone(contract.jsonSchema);const ids=context.evidence.map(row=>row.id)
  const visit=node=>{if(!node||typeof node!=='object')return;if(node.properties?.evidenceRefs)node.properties.evidenceRefs.items={type:'string',enum:ids};Object.values(node).forEach(visit)}
  visit(jsonSchema)
  if(contract===adminInsightContract){
    const summary=context.evidence.find(row=>row.id==='summary')?.data
    // Copy existing authoritative metrics; do not ask the model to calculate or paraphrase them.
    const text=`Based on the current PlacementHub data, ${summary.placedEligibleStudents} of ${summary.eligibleStudents} eligible students have confirmed placements; ${summary.unplacedEligibleStudents} remain unplaced and ${summary.confirmationPending} confirmations are pending.`
    jsonSchema.properties.summary.const=text
    jsonSchema.properties.evidenceRefs={type:'array',items:{type:'string',const:'summary'},minItems:1,maxItems:1}
    for(const key of ['highlights','concerns','recommendations']){jsonSchema.properties[key].minItems=1;jsonSchema.properties[key].maxItems=1}
    const retrySchema=structuredClone(jsonSchema)
    for(const key of ['highlights','concerns','recommendations'])retrySchema.properties[key].items.properties.evidenceRefs={type:'array',items:{type:'string',const:'summary'},minItems:1,maxItems:1}
    return {...contract,jsonSchema,validationRetryJsonSchema:retrySchema,
      validationRetryContext:()=>({kind:context.kind,scope:context.scope,evidence:context.evidence.filter(row=>row.id==='summary'),limitations:['Only supplied current cohort facts support factual claims. Recommendations are conditional advice.']}),
      validate(value,context){
      const validated=contract.validate(value,context)
      if(['highlights','concerns','recommendations'].some(key=>validated[key].length!==1))throw new AiProviderError('invalid_output')
      if(validated.summary!==text||validated.evidenceRefs.length!==1||validated.evidenceRefs[0]!=='summary')throw new AiProviderError('invalid_evidence')
      return validated
    }}
  }
  return {...contract,jsonSchema}
}
