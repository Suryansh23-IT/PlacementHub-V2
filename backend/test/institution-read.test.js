import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import jwt from 'jsonwebtoken'

process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/placementhub-v2-test'
process.env.JWT_SECRET = 'institution-read-test-secret-with-enough-length'
process.env.CLIENT_URL = 'http://localhost:5173'

const { app } = await import('../src/app.js')
const { User } = await import('../src/modules/auth/auth.model.js')
const { InstitutionProfile } = await import('../src/modules/institution/institution.model.js')
const { getInstitutionProfile } = await import('../src/modules/institution/institution.service.js')
const hash = document => createHash('sha256').update(JSON.stringify(document)).digest('hex')

test('repeated Institution HTTP GETs preserve every stored field and its hash', async t => {
  const stored = { _id: '507f1f77bcf86cd799439011', singletonKey: 'placementhub-v2', collegeName: 'Archived Institute', branches: ['Information Technology'], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' }
  const before = structuredClone(stored)
  const beforeHash = hash(stored)
  t.mock.method(User, 'findById', id => ({ select: async () => ({ _id: id, role: 'placement_admin', isActive: true }) }))
  t.mock.method(InstitutionProfile, 'findOne', query => { assert.deepEqual(query, { singletonKey: 'placementhub-v2' }); return Promise.resolve(structuredClone(stored)) })
  for (const method of ['findOneAndUpdate', 'updateOne', 'updateMany', 'create', 'insertMany']) t.mock.method(InstitutionProfile, method, () => { throw new Error('Institution GET attempted a database write') })
  t.mock.method(InstitutionProfile.prototype, 'save', () => { throw new Error('Institution GET attempted save') })
  const server = app.listen(0)
  t.after(() => new Promise(resolve => server.close(resolve)))
  const token = jwt.sign({}, process.env.JWT_SECRET, { subject: '507f1f77bcf86cd799439012', expiresIn: '5m' })
  for (let i = 0; i < 5; i++) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/admin/institution`, { headers: { Authorization: `Bearer ${token}` } })
    assert.equal(response.status, 200)
    assert.deepEqual((await response.json()).data, before)
    assert.deepEqual(stored, before)
    assert.equal(hash(stored), beforeHash)
  }
})

test('missing Institution GET uses independent in-memory defaults without inserting or saving', async t => {
  const institutionModel = { findOne: async () => null, findOneAndUpdate: () => { throw new Error('Unexpected upsert') } }
  t.mock.method(InstitutionProfile.prototype, 'save', () => { throw new Error('Unexpected save') })
  const first = await getInstitutionProfile({ institutionModel })
  assert.equal(first.singletonKey, 'placementhub-v2')
  assert.deepEqual(first.branches, [])
  assert.equal(first._id, undefined)
  assert.equal(first.createdAt, undefined)
  assert.equal(first.updatedAt, undefined)
  first.branches.push('Local display value')
  assert.deepEqual((await getInstitutionProfile({ institutionModel })).branches, [])
})
