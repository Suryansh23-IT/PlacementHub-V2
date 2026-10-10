import test from 'node:test'
import assert from 'node:assert/strict'
import { createAiService, getAiStatus } from '../src/modules/ai/ai.service.js'
import { isAiRuntime } from '../src/modules/ai/ai.guard.js'
import { buildSafeContext, fingerprint } from '../src/modules/ai/ai.context.js'
import { createMemoryCache } from '../src/modules/ai/ai.cache.js'
import { createOllamaProvider } from '../src/modules/ai/providers/ollama.provider.js'
import { validateAnalysis } from '../src/modules/ai/ai.schemas.js'
import { AiProviderError } from '../src/modules/ai/ai.errors.js'

const config = { MONGO_URI: 'mongodb://localhost/placementhub-v2-demo-2027', AI_ENABLED: true, AI_PROVIDER: 'ollama', OLLAMA_MODEL: 'mock-model', OLLAMA_BASE_URL: 'http://127.0.0.1:11434', AI_TIMEOUT_MS: 100, AI_MAX_OUTPUT_TOKENS: 128, AI_MAX_RESPONSE_BYTES: 4096, AI_MAX_CONTEXT_BYTES: 16384, AI_MAX_CONCURRENT: 2, AI_CACHE_MAX_ENTRIES: 2, AI_CACHE_TTL_MS: 100, AI_COOLDOWN_MS: 100 }
const output = { summary: 'Synthetic professional evidence.', strengths: [], gaps: [], recommendations: [] }
const actor = { _id: 'student-one', role: 'student' }
const request = (options = {}) => ({ actor, scope: 'own-profile', authorize: async () => true, loadContext: async () => ({ profile: { skills: ['JavaScript'] } }), ...options })

test('exact runtime guard rejects archived, unknown, suffix and malformed databases', () => {
  for (const MONGO_URI of ['mongodb://localhost/placementhub-v2', 'mongodb://localhost/unknown', 'mongodb://localhost/placementhub-v2-demo-2027-copy', 'bad']) {
    const archived = { ...config, MONGO_URI }; let initialized = 0
    assert.equal(isAiRuntime(archived), false)
    assert.throws(() => createAiService(archived, { providerFactory: () => initialized++, cacheFactory: () => initialized++ }), { errorCode: 'NOT_FOUND' })
    assert.throws(() => createMemoryCache(archived), { errorCode: 'NOT_FOUND' })
    assert.throws(() => createOllamaProvider(archived), { errorCode: 'NOT_FOUND' })
    assert.equal(initialized, 0)
  }
  assert.equal(isAiRuntime(config), true)
})

test('missing local provider config and disabled configuration do not initialize provider/cache', async () => {
  for (const values of [{ OLLAMA_BASE_URL: '' }, { OLLAMA_MODEL: '' }, { AI_ENABLED: false }]) {
    let initialized = 0; const cfg = { ...config, ...values }
    const service = createAiService(cfg, { providerFactory: () => initialized++, cacheFactory: () => initialized++ })
    assert.equal((await service.analyze(request())).status, 'unavailable')
    assert.equal(initialized, 0)
    assert.doesNotThrow(() => getAiStatus(cfg))
  }
})

test('nested allowlists exclude private, social, academic and non-job evidence', () => {
  const privateFields = { name: 'PRIVATE', email: 'PRIVATE', phone: 'PRIVATE', gender: 'PRIVATE', avatar: 'PRIVATE', hobbies: ['PRIVATE'], mbti: 'PRIVATE', branch: 'PRIVATE', cgpa: 10, rollNumber: 'PRIVATE', phaseHistory: ['PRIVATE'], socialProfile: { interests: ['PRIVATE'] } }
  const { context } = buildSafeContext({ profile: { ...privateFields, skills: ['JavaScript'], skillGroups: [{ name: 'PRIVATE', skills: ['React'], secret: 'PRIVATE' }], projects: [{ title: 'Portal', technologies: ['React'], description: 'Contact me at demo@example.test https://example.test/private +91 9876543210', ...{ url: 'PRIVATE', secret: 'PRIVATE' } }], internships: [{ role: 'Developer', description: 'Built systems', skills: ['Node.js'], phone: 'PRIVATE' }], certifications: [{ title: 'Credential', issuer: 'Training', credentialUrl: 'PRIVATE' }], leadership: [{ title: 'PRIVATE' }], achievements: [{ title: 'PRIVATE' }], resume: { storagePath: 'PRIVATE', originalName: 'PRIVATE' } }, drive: { role: { title: 'Developer', requiredSkills: ['React'], recruiterPhone: 'PRIVATE' }, eligibility: privateFields } }, { kind: 'match' })
  const json = JSON.stringify(context)
  for (const forbidden of ['PRIVATE', 'demo@example.test', 'https://example.test', '9876543210', 'gender', 'storagePath', 'cgpa', 'mbti']) assert(!json.includes(forbidden), forbidden)
  assert(context.evidence.some(entry => entry.type === 'project'))
})

test('canonical fingerprints ignore object-key order, private changes, skills ordering and duplicates', () => {
  assert.equal(fingerprint({ b: 2, a: 1 }), fingerprint({ a: 1, b: 2 }))
  const safe = profile => buildSafeContext({ profile }).context
  assert.equal(fingerprint(safe({ skills: ['React', 'JavaScript'], email: 'before' })), fingerprint(safe({ email: 'after', skills: ['javascript', 'react', 'React'], updatedAt: 'later', mbti: 'new' })))
  assert.notEqual(fingerprint(safe({ skills: ['React'] })), fingerprint(safe({ skills: ['Python'] })))
  const matching = requiredSkills => buildSafeContext({ drive: { role: { requiredSkills } } }, { kind: 'match' }).context
  assert.notEqual(fingerprint(matching(['React'])), fingerprint(matching(['Python'])))
})

test('resume replacement changes only resume-dependent fingerprint, never exposes metadata', () => {
  const first = { skills: ['React'], resume: { storagePath: '/private/old.pdf', uploadedAt: new Date(0), size: 100 } }
  const second = { ...first, resume: { storagePath: '/private/new.pdf', uploadedAt: new Date(1), size: 100 } }
  assert.equal(fingerprint(buildSafeContext({ profile: first })), fingerprint(buildSafeContext({ profile: second })))
  const a = buildSafeContext({ profile: first }, { resumeDependent: true }); const b = buildSafeContext({ profile: second }, { resumeDependent: true })
  assert.notEqual(a.resumeRevision, b.resumeRevision)
  assert.deepEqual(a.context, b.context)
  assert(!JSON.stringify(a).includes('/private/'))
})

test('schemas reject malformed, score injection and unknown evidence', () => {
  assert.throws(() => validateAnalysis({ summary: 'x' }), { code: 'invalid_output' })
  assert.throws(() => validateAnalysis({ ...output, score: 100 }), { code: 'invalid_output' })
  assert.throws(() => validateAnalysis({ ...output, strengths: [{ text: 'Claim', evidenceIds: ['invented'] }] }), { code: 'invalid_evidence' })
  assert.deepEqual(validateAnalysis({ ...output, strengths: [{ text: 'Claim', evidenceIds: ['skill:one'] }] }, ['skill:one']).strengths[0].evidenceIds, ['skill:one'])
})

test('memory cache expires, bounds entries and isolates returned objects', () => {
  let time = 0; const cache = createMemoryCache(config, { now: () => time })
  cache.set('a', output); const hit = cache.get('a'); hit.summary = 'changed'; assert.equal(cache.get('a').summary, output.summary)
  cache.set('b', output); cache.set('c', output); assert.equal(cache.get('a'), undefined)
  time = 100; assert.equal(cache.get('b'), undefined)
})

test('service is lazy, caches validated output and rechecks authorization on hits', async () => {
  let calls = 0; let checks = 0; let initialized = 0; let allowed = true
  const service = createAiService(config, { providerFactory: () => { initialized++; return { generate: async () => { calls++; return output } } } })
  assert.equal(initialized, 0)
  const input = request({ authorize: async () => { checks++; return allowed } })
  assert.equal((await service.analyze(input)).cached, false)
  assert.equal((await service.analyze(input)).cached, true)
  assert.equal(calls, 1); assert.equal(checks, 4)
  allowed = false; await assert.rejects(service.analyze(input), { errorCode: 'FORBIDDEN' }); assert.equal(calls, 1)
})

test('different actors, scopes and relevant context never share cached analyses', async () => {
  let calls = 0
  const service = createAiService({ ...config, AI_CACHE_MAX_ENTRIES: 10 }, { providerFactory: () => ({ generate: async () => { calls++; return output } }) })
  for (const options of [{}, { scope: 'another-drive' }, { actor: { ...actor, _id: 'student-two' } }, { loadContext: async () => ({ profile: { skills: ['Python'] } }) }]) await service.analyze(request(options))
  assert.equal(calls, 4)
})

test('duplicate requests coalesce while distinct work obeys concurrency bound', async () => {
  let release; let calls = 0
  const service = createAiService({ ...config, AI_MAX_CONCURRENT: 1 }, { providerFactory: () => ({ generate: () => { calls++; return new Promise(resolve => { release = () => resolve(output) }) } }) })
  const first = service.analyze(request()); const duplicate = service.analyze(request())
  await new Promise(resolve => setImmediate(resolve))
  assert.equal((await service.analyze(request({ scope: 'other' }))).reason, 'busy')
  release(); const results = await Promise.all([first, duplicate]); assert.equal(calls, 1); assert.deepEqual(results[0], results[1])
})

test('authorization revoked during provider request prevents output and cache exposure', async () => {
  let allowed = true; let writes = 0
  const service = createAiService(config, { cacheFactory: () => ({ get: () => undefined, set: () => { writes++ } }), providerFactory: () => ({ generate: async () => { allowed = false; return output } }) })
  await assert.rejects(service.analyze(request({ authorize: async () => allowed })), { errorCode: 'FORBIDDEN' }); assert.equal(writes, 0)
})

test('timeout, quota, malformed and evidence-invalid provider output fail gracefully without caching', async () => {
  for (const [reason, generate] of [['timeout', () => new Promise(() => {})], ['quota', async () => { throw new AiProviderError('quota') }], ['invalid_output', async () => ({ ...output, score: 90 })], ['invalid_evidence', async () => ({ ...output, gaps: [{ text: 'Missing', evidenceIds: ['fiction'] }] })], ['unavailable', async () => { throw new Error('SECRET raw provider error') }]]) {
    let writes = 0; const service = createAiService(config, { cacheFactory: () => ({ get: () => undefined, set: () => { writes++ } }), providerFactory: () => ({ generate }) })
    const result = await service.analyze(request()); assert.equal(result.reason, reason); assert.equal(writes, 0); assert(!JSON.stringify(result).includes('SECRET'))
  }
})

test('provider cooldown suppresses repeat calls and permits recovery after expiry', async () => {
  let time = 0; let calls = 0
  const service = createAiService(config, { now: () => time, providerFactory: () => ({ generate: async () => { if (++calls === 1) throw new AiProviderError('quota'); return output } }) })
  assert.equal((await service.analyze(request())).reason, 'quota')
  assert.equal((await service.analyze(request())).reason, 'cooldown'); assert.equal(calls, 1)
  time = 101; assert.equal((await service.analyze(request())).status, 'available')
})

test('optional cache read/write failures do not break analysis', async () => {
  const service = createAiService(config, { cacheFactory: () => ({ get: () => { throw new Error('cache down') }, set: () => { throw new Error('cache down') } }), providerFactory: () => ({ generate: async () => output }) })
  assert.equal((await service.analyze(request())).status, 'available')
})

test('cache initialization failure falls back to uncached analysis', async () => {
  const service = createAiService(config, { cacheFactory: () => { throw new Error('cache unavailable') }, providerFactory: () => ({ generate: async () => output }) })
  assert.equal((await service.analyze(request())).status, 'available')
})

test('service cache expires and refreshes context without retaining raw prompts', async () => {
  let time = 0; let calls = 0; const stored = []
  const service = createAiService(config, { now: () => time, cacheFactory: cfg => {
    const cache = createMemoryCache(cfg, { now: () => time })
    return { get: cache.get, set: (key, value) => { stored.push({ key, value }); cache.set(key, value) } }
  }, providerFactory: () => ({ generate: async () => { calls++; return output } }) })
  await service.analyze(request()); time = 101; await service.analyze(request()); assert.equal(calls, 2)
  assert.deepEqual(Object.keys(stored[0].value).sort(), ['gaps', 'recommendations', 'strengths', 'summary'])
  assert.match(stored[0].key, /^[a-f0-9]{64}$/)
})

test('oversized context stops before provider/cache initialization', async () => {
  let initialized = 0
  const service = createAiService({ ...config, AI_MAX_CONTEXT_BYTES: 10 }, { cacheFactory: () => initialized++, providerFactory: () => initialized++ })
  assert.equal((await service.analyze(request())).reason, 'context_limit'); assert.equal(initialized, 0)
})


test('runtime reset aborts active work, clears queued work and protects a newer generation', async () => {
  let release; let signal; let calls = 0; let queued = 2
  const service = createAiService({...config,AI_MAX_CONCURRENT:1,AI_TIMEOUT_MS:10000}, {providerFactory:()=>({generate:options=>{signal=options.signal;calls++;return calls===1?new Promise(resolve=>{release=resolve}):Promise.resolve({...output,summary:'New successful result.'})}})})
  service.registerQueue({count:()=>queued,cancel:()=>{queued=0}})
  assert.equal(service.runtimeStatus().status,'IDLE')
  const first=service.analyze(request());while(!release)await new Promise(resolve=>setTimeout(resolve,0))
  assert.equal(service.runtimeStatus().status,'BUSY');assert.equal(service.runtimeStatus().queued,2)
  assert(!JSON.stringify(service.runtimeStatus()).includes('JavaScript'))
  service.resetRuntime();assert(signal.aborted);assert.equal(service.runtimeStatus().status,'IDLE');assert.equal(queued,0)
  assert.equal((await first).reason,'cancelled')
  const second=await service.analyze(request());assert.equal(second.analysis.summary,'New successful result.')
  release(output);await new Promise(resolve=>setTimeout(resolve,0))
  assert.equal((await service.analyze(request())).analysis.summary,'New successful result.')
  assert.equal(service.availability().active,0);assert.equal(calls,2)
})

test('reset preserves successful cache and cancels duplicate waiters',async()=>{
 let release;let calls=0
 const service=createAiService({...config,AI_TIMEOUT_MS:10000},{providerFactory:()=>({generate:()=>{calls++;return calls===1?Promise.resolve(output):new Promise(resolve=>{release=resolve})}})})
 await service.analyze(request());const task=service.analyze(request({forceRefresh:true}));while(!release)await new Promise(resolve=>setTimeout(resolve,0))
 const duplicate=service.analyze(request({forceRefresh:true}));await new Promise(resolve=>setTimeout(resolve,0));service.resetRuntime()
 assert.equal((await task).reason,'cancelled');assert.equal((await duplicate).reason,'cancelled')
 assert.equal((await service.analyze(request())).cached,true)
 release(output)
})

test('normal deadline aborts an uncooperative provider and releases gate',async()=>{
 let signal;let calls=0
 const service=createAiService({...config,AI_TIMEOUT_MS:20,AI_COOLDOWN_MS:0},{providerFactory:()=>({generate:options=>{signal=options.signal;return ++calls===1?new Promise(()=>{}):Promise.resolve(output)}})})
 assert.equal((await service.analyze(request())).reason,'timeout');assert(signal.aborted);assert.equal(service.runtimeStatus().status,'IDLE')
 assert.equal((await service.analyze(request())).status,'available')
})

test('independent watchdog cancels a stuck runtime after bounded recovery grace',async()=>{
 const {createAiRuntime}=await import('../src/modules/ai/ai-runtime.js')
 const runtime=createAiRuntime({...config,AI_TIMEOUT_MS:5});let signal;let cancelled=0
 runtime.registerQueue({count:()=>1,cancel:()=>cancelled++})
 const task=runtime.run('admin:placement:ask',s=>{signal=s;return new Promise(()=>{})})
 await assert.rejects(task,{code:'timeout'});assert(signal.aborted);assert.equal(runtime.status().status,'IDLE');assert.equal(cancelled,1)
 assert.equal(await runtime.run('student-career',async()=>42),42)
 assert.throws(()=>createAiRuntime({...config,MONGO_URI:'mongodb://localhost/placementhub-v2'}),{errorCode:'NOT_FOUND'})
})
