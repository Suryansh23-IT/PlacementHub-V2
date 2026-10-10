import test from 'node:test'
import assert from 'node:assert/strict'
import { createOllamaProvider } from '../src/modules/ai/providers/ollama.provider.js'
import { createAiProvider, providerIdentity } from '../src/modules/ai/providers/ai.provider.js'
import { createAiService, getAiStatus } from '../src/modules/ai/ai.service.js'
import { constrainEvidenceSchema, analysisJsonSchema } from '../src/modules/ai/ai.schemas.js'
import { createQuestionContract } from '../src/modules/ai/ai-question.js'

const config = { MONGO_URI: 'mongodb://localhost/placementhub-v2-demo-2027', AI_ENABLED: true, AI_PROVIDER: 'ollama', OLLAMA_MODEL: 'qwen3.5:4b', OLLAMA_BASE_URL: 'http://127.0.0.1:11434', OLLAMA_NUM_CTX: 8192, AI_TIMEOUT_MS: 100, AI_MAX_OUTPUT_TOKENS: 2048, AI_MAX_RESPONSE_BYTES: 4096, AI_MAX_CONTEXT_BYTES: 16384, AI_MAX_CONCURRENT: 1, AI_CACHE_MAX_ENTRIES: 10, AI_CACHE_TTL_MS: 60000, AI_COOLDOWN_MS: 100 }
const output = { summary: 'Documented professional evidence.', strengths: [], gaps: [], recommendations: [] }
const input = { system: 'Trusted rules', prompt: 'Synthetic data', jsonSchema: analysisJsonSchema }
const envelope = (value = output, overrides = {}) => new Response(JSON.stringify({ done: true, done_reason: 'stop', message: { content: JSON.stringify(value) }, ...overrides }))
const request = scope => ({ actor: { _id: 'one', role: 'student' }, scope, authorize: async () => true, loadContext: async () => ({ profile: { skills: ['React'], email: 'private@example.test' } }) })

test('Ollama uses backend-only non-thinking structured API with bounded options', async () => {
  let calls = 0
  const provider = createOllamaProvider(config, { fetchImpl: async (url, options) => {
    calls++; assert.equal(url, 'http://127.0.0.1:11434/api/chat'); assert.equal(options.redirect, 'error')
    const body = JSON.parse(options.body)
    assert.equal(body.think, false); assert.equal(body.stream, false); assert.equal(body.options.num_predict, 1024); assert.equal(body.options.num_ctx, 8192)
    assert.equal(body.messages.length, 2); assert.deepEqual(body.format, analysisJsonSchema)
    assert.match(body.messages[0].content, /not documented/); assert(!options.headers['x-goog-api-key'])
    return envelope()
  } })
  assert.deepEqual(await provider.generate(input), output); assert.equal(calls, 1)
})

test('2026/unknown guard rejects Ollama and provider factory before any fetch', () => {
  for (const database of ['placementhub-v2', 'unknown']) {
    const archived = { ...config, MONGO_URI: `mongodb://localhost/${database}` }
    assert.throws(() => createOllamaProvider(archived), { errorCode: 'NOT_FOUND' })
    assert.throws(() => createAiProvider(archived), { errorCode: 'NOT_FOUND' })
  }
})

test('status is selected-provider-specific, lazy, and does not require API key', () => {
  assert.equal(getAiStatus(config).configured, true)
  assert.equal(getAiStatus(config).provider, 'ollama')
  assert.equal(providerIdentity({ ...config, AI_PROVIDER: 'unsupported' }).configured, false)
  assert.equal(getAiStatus({ ...config, AI_ENABLED: false }).status, 'disabled')
})

test('HTTP quota/busy/network errors never retry or switch providers', async () => {
  for (const [status, reason] of [[429, 'quota'], [503, 'busy'], [500, 'unavailable'], [404, 'unavailable']]) {
    let calls = 0
    const provider = createOllamaProvider(config, { fetchImpl: async url => { calls++; assert(url.includes('127.0.0.1')); return new Response('PRIVATE provider body', { status }) } })
    await assert.rejects(provider.generate(input), { code: reason }); assert.equal(calls, 1)
  }
  await assert.rejects(createOllamaProvider(config, { fetchImpl: async () => { throw new Error('PRIVATE') } }).generate(input), { code: 'unavailable' })
})

test('malformed, truncated, oversized, thinking and tool outputs are safely rejected', async () => {
  for (const [response, reason] of [[new Response('bad-json'), 'invalid_output'], [envelope(output, { done_reason: 'length' }), 'output_limit'], [envelope(output, { done: false }), 'invalid_output'], [envelope(output, { message: { content: '{}', thinking: 'trace' } }), 'invalid_output'], [envelope(output, { message: { content: '{}', tool_calls: [{}] } }), 'invalid_output'], [envelope({ summary: 'x'.repeat(5000) }), 'invalid_output'], [envelope(output, { message: { content: 'bad-json' } }), 'invalid_output']]) {
    await assert.rejects(createOllamaProvider(config, { fetchImpl: async () => response }).generate(input), { code: reason })
  }
})

test('abort and timeout bound local requests', async () => {
  const controller = new AbortController(); controller.abort()
  const provider = createOllamaProvider(config, { fetchImpl: async (url, options) => { if (options.signal.aborted) throw options.signal.reason; return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason))) } })
  await assert.rejects(provider.generate({ ...input, signal: controller.signal }), { code: 'timeout' })
  const keepAlive = setTimeout(() => {}, 200)
  try { await assert.rejects(provider.generate(input), { code: 'timeout' }) } finally { clearTimeout(keepAlive) }
})

test('unsafe base URLs are rejected without fetching', async () => {
  for (const base of ['ftp://localhost', 'http://user:secret@localhost', 'http://localhost/api', 'http://localhost/?secret=x']) {
    let calls = 0
    await assert.rejects(createOllamaProvider({ ...config, OLLAMA_BASE_URL: base }, { fetchImpl: async () => { calls++ } }).generate(input), { code: 'not_configured' }); assert.equal(calls, 0)
  }
})

test('generation schema allows only known references and never mutates the original', () => {
  const context = { evidence: [{ id: 'skill:one' }] }
  const constrained = constrainEvidenceSchema(analysisJsonSchema, context)
  assert.deepEqual(constrained.properties.strengths.items.properties.evidenceIds.items.enum, ['skill:one'])
  assert.equal(analysisJsonSchema.properties.strengths.items.properties.evidenceIds.items.enum, undefined)
  const empty = constrainEvidenceSchema(createQuestionContract('facts').jsonSchema, { evidence: [] })
  assert.equal(empty.properties.evidenceIds.maxItems, 0)
})

test('provider/model/endpoint changes isolate cache; private changes do not', async () => {
  const entries = new Map(); let calls = 0
  const dependencies = { cacheFactory: () => ({ get: key => entries.get(key), set: (key, value) => entries.set(key, value) }), providerFactory: () => ({ generate: async ({ prompt }) => { calls++; assert(!prompt.includes('private@example.test')); return output } }) }
  const a = createAiService(config, dependencies)
  assert.equal((await a.analyze(request('career'))).cached, false)
  assert.equal((await a.analyze(request('career'))).cached, true)
  for (const override of [{ OLLAMA_MODEL: 'other:4b' }, { OLLAMA_BASE_URL: 'http://localhost:11434' }]) await createAiService({ ...config, ...override }, dependencies).analyze(request('career'))
  assert.equal(calls, 3)
})

test('Ollama failure retains service fallback without switching providers', async () => {
  let calls = 0
  const service = createAiService(config, { providerFactory: cfg => { assert.equal(cfg.AI_PROVIDER, 'ollama'); return { generate: async () => { calls++; throw new Error('offline') } } } })
  const result = await service.analyze(request('career')); assert.equal(result.reason, 'unavailable'); assert.equal(calls, 1)
})

test('absence wording describes documentation only and preserves rubric ratings and IDs', async () => {
  const value = { summary: 'The candidate lacks SQL evidence.', answer: 'Java skills you do not yet possess. You lack SQL.', sections: [{ key: 'projects', rating: 1, reason: 'Lack of documented outcomes.', evidenceIds: ['project:lacks'] }] }
  const result = await createOllamaProvider(config, { fetchImpl: async () => envelope(value) }).generate(input)
  assert.equal(result.summary, 'The candidate does not document SQL evidence.')
  assert.equal(result.answer, 'Java skills your available evidence does not document. you do not document SQL.')
  assert.equal(result.sections[0].rating, 1); assert.deepEqual(result.sections[0].evidenceIds, ['project:lacks'])
  assert.equal(result.sections[0].reason, 'absence of documented outcomes.')
})
