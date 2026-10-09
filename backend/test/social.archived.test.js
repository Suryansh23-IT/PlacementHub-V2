import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/placementhub-v2-archived-test'
process.env.JWT_SECRET = randomUUID().repeat(2)
const { app } = await import('../src/app.js')
const { User } = await import('../src/modules/auth/auth.model.js')
const jwt = (await import('jsonwebtoken')).default
test('archived authenticated social requests cannot read, upload or mutate any content', async t => {
  const id = '000000000000000000000001'
  t.mock.method(User, 'findById', () => ({ select: async () => ({ _id: id, role: 'placement_admin', isActive: true }) }))
  const token = jwt.sign({}, process.env.JWT_SECRET, { subject: id })
  const server = app.listen(0)
  try {
    for (const [method, endpoint] of [['GET', '/notifications'], ['PATCH', '/notifications/read-all'], ['PATCH', `/notifications/${id}/read`], ['GET', `/profiles/${id}`], ['PATCH', `/profiles/${id}`], ['GET', `/profiles/${id}/avatar`], ['GET', `/profiles/${id}/main-profile`], ['GET', '/posts'], ['POST', '/posts'], ['GET', `/posts/${id}`], ['GET', `/posts/${id}/image`], ['PATCH', `/posts/${id}`], ['DELETE', `/posts/${id}`], ['POST', `/posts/${id}/like`], ['DELETE', `/posts/${id}/like`], ['GET', `/posts/${id}/comments`], ['POST', `/posts/${id}/comments`], ['DELETE', `/comments/${id}`]]) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/social${endpoint}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data; boundary=invalid' } })
      assert.equal(response.status, 404, `${method} ${endpoint}`)
    }
  } finally { await new Promise(resolve => server.close(resolve)) }
})

test('archived Company publishing is rejected before upload or content storage', async t => {
  const id = '000000000000000000000003'
  t.mock.method(User, 'findById', () => ({ select: async () => ({ _id: id, role: 'company', isActive: true }) }))
  const token = jwt.sign({}, process.env.JWT_SECRET, { subject: id }), server = app.listen(0)
  try {
    for (const method of ['POST', 'PATCH', 'DELETE']) {
      const endpoint = method === 'POST' ? '/posts' : `/posts/${id}`
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/social${endpoint}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data; boundary=invalid' } })
      assert.equal(response.status, 404)
    }
  } finally { await new Promise(resolve => server.close(resolve)) }
})
