// Explicit manual benchmark only. Synthetic data, no database or credentials.
import { createQuestionContract } from '../src/modules/ai/ai-question.js'

const cases = [
  { name: 'career', question: 'What should I improve first?', evidence: [{ id: 'skill:js', type: 'skill', name: 'JavaScript' }, { id: 'project:portal', type: 'project', title: 'Placement portal', description: 'Built React forms and a Node API', technologies: ['React', 'Node.js'] }], facts: { targetRole: 'Frontend Developer', resumeAvailable: true, experience: 'not documented', resumeText: 'unavailable' } },
  { name: 'drive', question: 'What should I study first for this role?', evidence: [{ id: 'skill:react', type: 'skill', name: 'React' }, { id: 'project:forms', type: 'project', title: 'Application forms', description: 'React forms with validation', technologies: ['React'] }], facts: { role: 'Frontend Developer', requiredSkills: ['React', 'TypeScript'], objectiveMatch: 60, missingSkills: ['TypeScript'], eligibility: 'separate and not supplied' } },
  { name: 'candidate', question: 'Summarize the documented fit and suggest two interview questions.', evidence: [{ id: 'skill:python', type: 'skill', name: 'Python' }, { id: 'project:api', type: 'project', title: 'Inventory API', description: 'Built REST endpoints with Flask and SQLite', technologies: ['Python', 'Flask', 'SQLite'] }], facts: { role: 'Backend Developer', requiredSkills: ['Python', 'PostgreSQL'], experience: 'not documented', resumeText: 'unavailable' } },
  { name: 'admin', question: 'Which branch needs attention and which drive has the fewest applications?', evidence: [], facts: { branches: [{ name: 'IT', students: 100, placed: 60, placementRate: 60 }, { name: 'CSE', students: 100, placed: 80, placementRate: 80 }], drives: [{ name: 'Alpha', applications: 12 }, { name: 'Beta', applications: 3 }], unplacedStudents: 60 } },
]
const contract = createQuestionContract('bounded PlacementHub evidence and trusted facts')
for (const input of cases) {
  for (let repeat = 1; repeat <= 2; repeat++) {
    const context = { evidence: input.evidence, trustedFacts: input.facts, userQuestion: input.question, allowedEvidenceIds: input.evidence.map(row => row.id) }
    const started = performance.now()
    try {
      const format = structuredClone(contract.jsonSchema)
      format.properties.evidenceIds = context.allowedEvidenceIds.length ? { type: 'array', items: { type: 'string', enum: context.allowedEvidenceIds }, maxItems: 10 } : { type: 'array', items: { type: 'string' }, maxItems: 0 }
      const response = await fetch('http://127.0.0.1:11434/api/chat', { method: 'POST', signal: AbortSignal.timeout(120_000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'qwen3.5:4b', think: false, stream: false, keep_alive: '10m', format, options: { temperature: 0, seed: 42, num_ctx: 4096, num_predict: 512 }, messages: [{ role: 'system', content: `${contract.instruction} Give useful actionable learning/interview suggestions based on the documented evidence; suggestions are allowed even without internship or resume text. Do not require verification or eligibility to give preparation advice. An absent skill is ONLY not documented, never proven absent: say "TypeScript is not documented", never "you lack TypeScript". General learning suggestions must be presented as suggestions, not facts about the person. Be concise: at most 120 words. No candidate decisions. Use only supplied facts. evidenceIds must contain only allowedEvidenceIds; when none exist return [].` }, { role: 'user', content: JSON.stringify(context) }] }) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const body = await response.json()
      const answer = contract.validate(JSON.parse(body.message.content), context)
      console.info(JSON.stringify({ case: input.name, repeat, seconds: Number(((performance.now() - started) / 1000).toFixed(2)), doneReason: body.done_reason, tokens: body.eval_count, tokensPerSecond: Number((body.eval_count / (body.eval_duration / 1e9)).toFixed(2)), thinking: Boolean(body.message.thinking), valid: true, ...answer }))
    } catch (error) { console.info(JSON.stringify({ case: input.name, repeat, seconds: Number(((performance.now() - started) / 1000).toFixed(2)), valid: false, reason: error.code ?? error.name })); process.exitCode = 1 }
  }
}
const loaded = await fetch('http://127.0.0.1:11434/api/ps').then(response => response.json())
console.info(JSON.stringify({ loaded: loaded.models.map(model => ({ model: model.name, bytes: model.size, vramBytes: model.size_vram, contextLength: model.context_length })) }))
