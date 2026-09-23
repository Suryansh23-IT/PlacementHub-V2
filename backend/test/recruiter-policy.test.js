import assert from 'node:assert/strict'
import test from 'node:test'
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/placementhub-v2-test'
process.env.JWT_SECRET = 'recruiter-policy-test-secret-which-is-safely-long-enough'
process.env.CLIENT_URL = 'http://localhost:5173'
const { acceptRecruiterPolicy, getRecruiterPolicyStatus, getRecruiterAgreementSummary, listRecruiterPolicies, saveRecruiterPolicy, requireApprovedCompany } = await import('../src/modules/recruiter-policy/recruiter-policy.service.js')
const { recruiterPolicySchema, recruiterAcceptanceSchema } = await import('../src/modules/recruiter-policy/recruiter-policy.validation.js')
const { RecruiterPlacementPolicy, RecruiterPolicyAcceptance } = await import('../src/modules/recruiter-policy/recruiter-policy.model.js')
const { StudentPlacementPolicy, StudentPolicyAcceptance } = await import('../src/modules/student-policy/student-policy.model.js')
const input = { title: 'Test recruiter policy', academicYear: '2026–27', version: '1.0', policyText: 'Test-only policy content for automated verification.', active: true }

function models() {
  const policies = [], acceptances = []
  const company = { approvalStatus: 'approved', companyName: 'Test Company', participationLetter: { originalName: 'letter.pdf' } }
  const matches = (item, query) => Object.entries(query).every(([key, value]) => value?.$ne ? String(item[key]) !== String(value.$ne) : String(item[key]) === String(value))
  const policyModel = {
    find: () => ({ sort: async () => [...policies].reverse() }),
    async findOne(query) { return policies.find(item => matches(item, query)) ?? null },
    async findById(id) { return policies.find(item => item._id === id) ?? null },
    async create(values) { const policy = { _id: String(policies.length + 1).padStart(24, '0'), ...values }; policies.push(policy); return policy },
    async updateMany(query, update) { policies.filter(item => matches(item, query)).forEach(item => Object.assign(item, update.$set)) },
    async findByIdAndUpdate(id, update) { const policy = await this.findById(id); if (policy) Object.assign(policy, update.$set); return policy },
  }
  const acceptanceModel = {
    async findOne(query) { return acceptances.find(item => matches(item, query)) ?? null },
    async create(values) { if (acceptances.some(item => item.companyId === values.companyId && item.policyId === values.policyId)) throw Object.assign(new Error('Duplicate'), { code: 11000 }); acceptances.push(values); return values },
  }
  return { policies, acceptances, company, policyModel, acceptanceModel, companyModel: { findOne: () => ({ select: async () => company }) } }
}
const signature = policy => ({ policyId: String(policy._id), policyVersion: policy.version, agreed: true })

test('Recruiter policy has no invented default and missing active policy is handled', async () => {
  const m = models()
  assert.deepEqual(await listRecruiterPolicies(m), [])
  assert.deepEqual(await getRecruiterPolicyStatus('company-1', m), { policy: null, acceptance: null })
  assert.equal((await getRecruiterAgreementSummary('company-1', m)).status, 'not_accepted')
  await assert.rejects(acceptRecruiterPolicy('company-1', { agreed: true }, m), { errorCode: 'NOT_FOUND' })
  assert.equal(m.policies.length, 0)
})

test('Admin activates, deactivates and selects versions while preserving immutable text', async () => {
  const m = models()
  const first = await saveRecruiterPolicy(input, m)
  const second = await saveRecruiterPolicy({ ...input, version: '2.0' }, m)
  assert.equal(m.policies.filter(policy => policy.active).length, 1)
  assert.equal(first.active, false)
  await assert.rejects(saveRecruiterPolicy({ ...input, id: first._id, policyText: 'Edited signed text should be refused.' }, m), { errorCode: 'CONFLICT' })
  await assert.rejects(saveRecruiterPolicy(input, m), { errorCode: 'CONFLICT' })
  await assert.rejects(saveRecruiterPolicy({ ...input, id: 'missing' }, m), { errorCode: 'NOT_FOUND' })
  assert.equal(second.active, true)
  await saveRecruiterPolicy({ ...input, version: '2.0', id: second._id, active: false }, m)
  assert.equal((await getRecruiterPolicyStatus('company-1', m)).policy, null)
  await saveRecruiterPolicy({ ...input, id: first._id }, m)
  assert.equal(first.active, true)
  assert.equal(first.policyText, input.policyText)
})

test('only approved Companies sign; acceptance stores identity/version/date without changing profile', async () => {
  const m = models()
  const policy = await saveRecruiterPolicy(input, m)
  for (const status of ['pending', 'rejected']) {
    m.company.approvalStatus = status
    await assert.rejects(requireApprovedCompany('company-1', m), { errorCode: 'FORBIDDEN' })
    await assert.rejects(acceptRecruiterPolicy('company-1', signature(policy), m), { errorCode: 'FORBIDDEN' })
  }
  m.company.approvalStatus = 'approved'
  const before = structuredClone(m.company)
  const { acceptance } = await acceptRecruiterPolicy('company-1', signature(policy), m)
  assert.equal(acceptance.companyId, 'company-1')
  assert.equal(acceptance.policyId, policy._id)
  assert.equal(acceptance.policyVersion, policy.version)
  assert.ok(acceptance.acceptedAt instanceof Date)
  assert.deepEqual(m.company, before)
  assert.equal((await getRecruiterPolicyStatus('company-1', m)).acceptance, acceptance)
  assert.equal((await getRecruiterAgreementSummary('company-1', m)).status, 'accepted')
  assert.equal((await getRecruiterAgreementSummary('company-2', m)).status, 'not_accepted')
  await assert.rejects(acceptRecruiterPolicy('company-1', signature(policy), m), { errorCode: 'CONFLICT' })
})

test('fresh versions require fresh explicit acceptance and stale version requests are refused', async () => {
  const m = models()
  const first = await saveRecruiterPolicy(input, m)
  await acceptRecruiterPolicy('company-1', signature(first), m)
  const second = await saveRecruiterPolicy({ ...input, version: '2.0' }, m)
  assert.equal((await getRecruiterAgreementSummary('company-1', m)).status, 'not_accepted')
  await assert.rejects(acceptRecruiterPolicy('company-1', signature(first), m), { errorCode: 'CONFLICT' })
  await assert.rejects(acceptRecruiterPolicy('company-1', { ...signature(second), agreed: false }, m), { errorCode: 'CONFLICT' })
  await acceptRecruiterPolicy('company-1', signature(second), m)
  assert.equal(m.acceptances.length, 2)
  await saveRecruiterPolicy({ ...input, id: first._id }, m)
  await assert.rejects(acceptRecruiterPolicy('company-1', signature(first), m), { errorCode: 'CONFLICT' })
})

test('concurrent duplicate signatures become conflicts and schema indexes enforce uniqueness', async () => {
  const m = models()
  const policy = await saveRecruiterPolicy(input, m)
  const results = await Promise.allSettled([acceptRecruiterPolicy('company-1', signature(policy), m), acceptRecruiterPolicy('company-1', signature(policy), m)])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(results.find(result => result.status === 'rejected').reason.errorCode, 'CONFLICT')
  assert.ok(RecruiterPlacementPolicy.schema.indexes().some(([keys, options]) => keys.active === 1 && options.unique && options.partialFilterExpression.active))
  assert.ok(RecruiterPlacementPolicy.schema.indexes().some(([keys, options]) => keys.academicYear === 1 && keys.version === 1 && options.unique))
  assert.ok(RecruiterPolicyAcceptance.schema.indexes().some(([keys, options]) => keys.companyId === 1 && keys.policyId === 1 && options.unique))
  assert.ok(StudentPlacementPolicy.schema.indexes().some(([keys, options]) => keys.active === 1 && options.unique))
  assert.ok(StudentPolicyAcceptance.schema.indexes().some(([keys, options]) => keys.studentId === 1 && keys.policyId === 1 && options.unique))
  assert.equal(StudentPolicyAcceptance.schema.path('policyId').options.ref, 'StudentPlacementPolicy')
})

test('policy and signature validation require content, exact version and explicit consent', () => {
  assert.equal(recruiterPolicySchema.safeParse(input).success, true)
  assert.equal(recruiterPolicySchema.safeParse({ ...input, policyText: '' }).success, false)
  assert.equal(recruiterAcceptanceSchema.safeParse({ policyId: '000000000000000000000001', policyVersion: '1.0', agreed: true }).success, true)
  assert.equal(recruiterAcceptanceSchema.safeParse({ policyId: '000000000000000000000001', policyVersion: '1.0' }).success, false)
})

test('Recruiter endpoints enforce authentication, role, approval and consent; Admin has no signing override', async t => {
  const { app } = await import('../src/app.js')
  const { User } = await import('../src/modules/auth/auth.model.js')
  const { Company } = await import('../src/modules/companies/company.model.js')
  const { default: jwt } = await import('jsonwebtoken')
  const { env } = await import('../src/config/env.js')
  const id = '507f1f77bcf86cd799439011'
  let role = 'company', approvalStatus = 'pending'
  t.mock.method(User, 'findById', () => ({ select: async () => ({ _id: id, role, isActive: true }) }))
  t.mock.method(Company, 'findOne', () => ({ select: async () => ({ approvalStatus }) }))
  t.mock.method(RecruiterPlacementPolicy, 'findOne', async () => null)
  const server = app.listen(0)
  try {
    const base = `http://127.0.0.1:${server.address().port}/api/v1`
    const headers = { Authorization: `Bearer ${jwt.sign({}, env.JWT_SECRET, { subject: id, expiresIn: '1h' })}`, 'Content-Type': 'application/json' }
    for (const path of ['/companies/me/policy', '/admin/recruiter-policy', `/admin/recruiter-policy/companies/${id}`]) assert.equal((await fetch(base + path)).status, 401)
    assert.equal((await fetch(`${base}/admin/recruiter-policy`, { headers })).status, 403)
    assert.equal((await fetch(`${base}/companies/me/policy`, { headers })).status, 403)
    const body = JSON.stringify({ policyId: id, policyVersion: '1.0', agreed: true })
    assert.equal((await fetch(`${base}/companies/me/policy/accept`, { method: 'POST', headers, body })).status, 403)
    approvalStatus = 'approved'
    assert.equal((await fetch(`${base}/companies/me/policy`, { headers })).status, 200)
    assert.equal((await fetch(`${base}/companies/me/policy/accept`, { method: 'POST', headers, body: '{}' })).status, 422)
    for (const deniedRole of ['student', 'placement_admin']) {
      role = deniedRole
      assert.equal((await fetch(`${base}/companies/me/policy/accept`, { method: 'POST', headers, body })).status, 403)
    }
    role = 'placement_admin'
    assert.equal((await fetch(`${base}/admin/recruiter-policy/companies/invalid`, { headers })).status, 422)
  } finally { await new Promise(resolve => server.close(resolve)) }
})
