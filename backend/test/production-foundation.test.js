import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
process.env.NODE_ENV = 'production'
process.env.MONGO_URI = 'mongodb://localhost/placementhub-v2-demo-2027'
process.env.JWT_SECRET = 'synthetic-production-foundation-secret-long-enough'
process.env.AI_ENABLED = 'false'
const { app } = await import('../src/app.js')
const { env } = await import('../src/config/env.js')
const { User } = await import('../src/modules/auth/auth.model.js')
const { StudentProfile } = await import('../src/modules/students/student.model.js')
const { createAiService } = await import('../src/modules/ai/ai.service.js')
const { createAiProvider } = await import('../src/modules/ai/providers/ai.provider.js')
const jwt = (await import('jsonwebtoken')).default

test('production refuses archived/unknown databases and accidental AI enable before startup', () => {
  for (const override of [{ MONGO_URI: 'mongodb://localhost/placementhub-v2' }, { MONGO_URI: 'mongodb://localhost/unknown' }, { AI_ENABLED: 'true' }]) {
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', "await import('./src/config/env.js')"], { cwd: new URL('..', import.meta.url), env: { ...process.env, ...override }, encoding: 'utf8', timeout: 10000 })
    assert.equal(child.status, 1, child.stderr); assert.match(child.stderr, /Production/)
  }
})
test('production service cannot construct provider/cache or load inference context even with accidental true flag', async () => {
  let calls = 0
  const forbidden = () => { calls++; throw Error('Disabled work') }
  const service = createAiService({ ...env, AI_ENABLED: true }, { providerFactory: forbidden, cacheFactory: forbidden })
  const response = await service.analyze({ actor: { _id: 'student', role: 'student' }, authorize: async () => true, loadContext: forbidden })
  assert.equal(response.reason, 'disabled'); assert.equal(calls, 0)
  assert.throws(() => createAiProvider(env), { code: 'disabled' })
})
test('production HTTP retains objective GET/POST, validation/auth and safely disables Ask and runtime reset', async t => {
  const query = value => ({ select() { return this }, lean: async () => value, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject) } })
  t.mock.method(User, 'findById', id => query({ _id: id, role: id === 'admin' ? 'placement_admin' : 'student', isActive: true }))
  t.mock.method(StudentProfile, 'findOne', () => query({ skills: ['React'], projects: [], resume: { storagePath: '/should-never-be-read.pdf' } }))
  // Any accidental provider network request must fail the test, not contact Ollama.
  const originalFetch = globalThis.fetch
  let inferenceCalls = 0
  t.mock.method(globalThis, 'fetch', (url, options) => {
    if (String(url).includes(':11434')) { inferenceCalls++; throw Error('Ollama forbidden') }
    return originalFetch(url, options)
  })
  const server = app.listen(0); t.after(() => new Promise(resolve => server.close(resolve)))
  const base = `http://127.0.0.1:${server.address().port}/api/v1`
  const headers = id => ({ Authorization: `Bearer ${jwt.sign({}, env.JWT_SECRET, { subject: id })}`, 'Content-Type': 'application/json' })
  assert.equal((await fetch(`${base}/health`)).status, 200)
  assert.equal((await fetch(`${base}/ai/students/me/career`)).status, 401)
  const status = await (await fetch(`${base}/ai/status`, { headers: headers('student') })).json()
  assert.equal(status.data.enabled, false); assert.equal(status.data.status, 'disabled')
  let score
  for (const [method, suffix] of [['GET', ''], ['POST', '/assessment'], ['POST', '/explanation']]) {
    const response = await fetch(`${base}/ai/students/me/career${suffix}`, { method, headers: headers('student'), ...(method === 'POST' ? { body: '{}' } : {}) })
    assert.equal(response.status, 200)
    const { data } = await response.json()
    assert.equal(data.ai.reason, 'disabled'); assert.equal(typeof data.deterministic.score, 'number')
    score ??= data.deterministic.score; assert.equal(data.deterministic.score, score)
  }
  const ask = await fetch(`${base}/ai/students/me/career/ask`, { method: 'POST', headers: headers('student'), body: JSON.stringify({ question: 'What should I learn?' }) })
  assert.equal((await ask.json()).data.ai.reason, 'disabled')
  assert.equal((await fetch(`${base}/ai/students/me/career/ask`, { method: 'POST', headers: headers('student'), body: '{}' })).status, 422)
  assert.equal((await fetch(`${base}/ai/admin/runtime`, { headers: headers('student') })).status, 403)
  for (const [method, suffix] of [['GET', ''], ['POST', '/reset']]) {
    const response = await fetch(`${base}/ai/admin/runtime${suffix}`, { method, headers: headers('admin'), ...(method === 'POST' ? { body: '{}' } : {}) })
    assert.equal((await response.json()).data.status, 'DISABLED')
  }
  assert.equal(inferenceCalls, 0)
})
