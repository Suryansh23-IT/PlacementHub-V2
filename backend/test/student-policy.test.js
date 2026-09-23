import assert from 'node:assert/strict'
import test from 'node:test'
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/placementhub-v2-test'
const { acceptActiveStudentPolicy, getStudentPolicyStatus, saveStudentPolicy } = await import('../src/modules/student-policy/student-policy.service.js')

function models() {
  const policies = []; const acceptances = []
  const policyModel = { async findOne(q) { return policies.find((x) => x.active === q.active) ?? null }, async create(input) { const x = { _id: `p${policies.length + 1}`, ...input }; policies.push(x); return x }, async updateMany(q, u) { policies.forEach((x) => { if (x.active && (!q._id || x._id !== q._id.$ne)) Object.assign(x, u.$set) }) }, async findByIdAndUpdate(id, u) { const x = policies.find((p) => p._id === id); if (x) Object.assign(x, u.$set); return x ?? null } }
  const acceptanceModel = { async findOne(q) { return acceptances.find((x) => x.studentId === q.studentId && x.policyId === q.policyId) ?? null }, async create(input) { const x = { ...input, acceptedAt: input.acceptedAt ?? new Date() }; acceptances.push(x); return x } }
  return { policyModel, acceptanceModel, profileModel: { findOne() { return { select: async () => ({ verificationStatus: 'verified' }) } } }, policies }
}
const input = { title: 'Student Placement Policy', academicYear: '2026–27', version: '1.0', policyText: 'A sufficiently long policy text for acceptance testing.', active: true }
test('Admin maintains one active Student policy version', async () => { const m = models(); await saveStudentPolicy(input, m); await saveStudentPolicy({ ...input, version: '2.0' }, m); assert.equal(m.policies.filter((x) => x.active).length, 1); assert.equal(m.policies.find((x) => x.active).version, '2.0') })
test('verified Student acceptance is permanent for a policy version and survives GET', async () => { const m = models(); const policy = await saveStudentPolicy(input, m); const accepted = await acceptActiveStudentPolicy('student-1', m); assert.equal(accepted.acceptance.policyVersion, policy.version); assert.ok(accepted.acceptance.acceptedAt); await assert.rejects(acceptActiveStudentPolicy('student-1', m), { errorCode: 'CONFLICT' }); assert.equal((await getStudentPolicyStatus('student-1', m)).acceptance.policyVersion, '1.0') })
test('unverified Student is denied and a newly activated version needs a new acceptance', async () => { const m = models(); await saveStudentPolicy(input, m); const pending = { ...m, profileModel: { findOne() { return { select: async () => ({ verificationStatus: 'pending' }) } } } }; await assert.rejects(acceptActiveStudentPolicy('student-1', pending), { errorCode: 'FORBIDDEN' }); await acceptActiveStudentPolicy('student-1', m); await saveStudentPolicy({ ...input, version: '2.0' }, m); assert.equal((await getStudentPolicyStatus('student-1', m)).acceptance, null) })
