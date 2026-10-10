import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/placementhub-v2-demo-2027'
process.env.JWT_SECRET = randomUUID().repeat(2)
process.env.AI_ENABLED = 'true'
process.env.AI_PROVIDER = 'ollama'
process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:11434'
process.env.OLLAMA_MODEL = 'qwen3.5:4b'
process.env.AI_RATE_LIMIT_MAX = '2'
const { app } = await import('../src/app.js')
const { User } = await import('../src/modules/auth/auth.model.js')
const jwt = (await import('jsonwebtoken')).default

test('2027 key-free app imports, health works, AI status authenticates and rate limits per user', async t => {
  t.mock.method(User, 'findById', id => ({ select: async () => ({ _id: id, role: 'student', isActive: true }) }))
  const server = app.listen(0); const base = `http://127.0.0.1:${server.address().port}/api/v1`
  t.after(() => new Promise(resolve => server.close(resolve)))
  const token = id => ({ Authorization: `Bearer ${jwt.sign({}, process.env.JWT_SECRET, { subject: id })}` })
  assert.equal((await fetch(`${base}/health`)).status, 200)
  assert.equal((await fetch(`${base}/ai/status`)).status, 401)
  for (let count = 0; count < 2; count++) {
    const result = await fetch(`${base}/ai/status`, { headers: token('one') }); assert.equal(result.status, 200)
    assert.deepEqual((await result.json()).data, { enabled: true, configured: true, provider: 'ollama', model: 'qwen3.5:4b', status: 'configured' })
  }
  const limited = await fetch(`${base}/ai/status`, { headers: token('one') }); assert.equal(limited.status, 429); assert.equal((await limited.json()).errorCode, 'RATE_LIMITED')
  assert.equal((await fetch(`${base}/ai/status`, { headers: token('two') })).status, 200)
  assert.equal((await fetch(`${base}/ai/analyze`, { method: 'POST', headers: token('three') })).status, 404)
})
