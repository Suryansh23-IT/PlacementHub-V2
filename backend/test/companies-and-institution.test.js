import assert from 'node:assert/strict'
import test from 'node:test'

process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/placementhub-v2-test'
process.env.JWT_SECRET = 'm4-company-test-secret-which-is-safely-long-enough'
process.env.CLIENT_URL = 'http://localhost:5173'

const { USER_ROLES } = await import('../src/modules/auth/auth.constants.js')
const { companyApprovalSchema, companyIdParamsSchema, companyProfileSchema } = await import('../src/modules/companies/company.validation.js')
const { ensureCompanyProfile, getAdminParticipationLetter, listCompaniesForReview, reviewCompany, updateCompanyProfile } = await import('../src/modules/companies/company.service.js')
const { institutionSchema } = await import('../src/modules/institution/institution.validation.js')
const { getInstitutionProfile, updateInstitutionProfile } = await import('../src/modules/institution/institution.service.js')
const { app } = await import('../src/app.js')
const validCompany = { companyName:'Acme Technologies',website:'https://acme.example',industry:'Software',companyType:'Private',companySize:'1000+',location:'Pune',officialEmail:'contact@acme.example',description:'Graduate hiring partner.',recruiterName:'Asha Rao',recruiterDesignation:'Talent Partner',recruiterEmail:'asha@acme.example',recruiterPhone:'9876543210',hiringType:'placement',recruitmentTimeline:'August 2026',recruitmentMode:'online',expectedHires:10,roleDomains:['Engineering'],targetBranches:['Information Technology'],participationLetter:{originalName:'letter.pdf',storagePath:'test.pdf'} }

function createCompanyProfileModel() {
  const profiles = []
  return {
    profiles,
    find() {
      return { lean: async () => profiles }
    },
    async findOneAndUpdate(query, update) {
      let profile = profiles.find((item) => item.userId === query.userId)
      if (!profile) {
        profile = { userId: query.userId, approvalStatus: 'pending', async save() { return this }, ...(update.$setOnInsert ?? {}) }
        profiles.push(profile)
      }
      if (update.$set) Object.assign(profile, update.$set)
      return profile
    },
  }
}

function createCompanyUserModel(companyId = 'company-1') {
  return {
    findOne(query) {
      const exists = query._id === companyId && query.role === USER_ROLES.COMPANY
      return { select: async () => exists ? { _id: companyId } : null }
    },
  }
}

function createInstitutionModel() {
  let profile
  return {
    async findOneAndUpdate(_query, update) {
      profile ??= { ...(update.$setOnInsert ?? {}) }
      if (update.$set) Object.assign(profile, update.$set)
      return profile
    },
  }
}

test('company profile validation accepts approved M4 fields and rejects incomplete input', () => {
  const valid = companyProfileSchema.safeParse(validCompany)
  assert.equal(valid.success, true)
  assert.equal(companyProfileSchema.safeParse({ companyName: 'Acme', website: 'not-a-url' }).success, false)
  assert.equal(companyApprovalSchema.safeParse({ status: 'rejected' }).success, false)
  assert.equal(companyApprovalSchema.safeParse({ status: 'approved', rejectionReason: 'Not applicable' }).success, false)
  assert.equal(companyIdParamsSchema.safeParse({ id: 'not-a-company-id' }).success, false)
  assert.equal(companyIdParamsSchema.safeParse({ id: '507f1f77bcf86cd799439011' }).success, true)
})

test('company profiles remain one-to-one and begin pending through profile updates', async () => {
  const companyModel = createCompanyProfileModel()
  const first = await ensureCompanyProfile('company-1', { companyModel })
  const second = await ensureCompanyProfile('company-1', { companyModel })
  assert.equal(companyModel.profiles.length, 1)
  assert.equal(first, second)
  assert.equal(first.approvalStatus, 'pending')
  const updated = await updateCompanyProfile('company-1', validCompany, { companyModel })
  assert.equal(updated.companyName, 'Acme Technologies')
  assert.equal(updated.approvalStatus, 'pending')
})

test('the Admin review list receives the backend-owned company profile completeness state', async () => {
  const companyModel = createCompanyProfileModel()
  const userModel = { find: () => ({ select: () => ({ lean: async () => [{ _id: 'company-1', name: 'Acme Recruiter', email: 'recruiter@example.test' }] }) }) }
  const incomplete = await listCompaniesForReview({ userModel, companyModel })
  assert.equal(incomplete[0].isProfileComplete, false)
  await updateCompanyProfile('company-1', validCompany, { companyModel })
  const complete = await listCompaniesForReview({ userModel, companyModel })
  assert.equal(complete[0].isProfileComplete, true)
})

test('only a pending company can receive one approval decision', async () => {
  const companyModel = createCompanyProfileModel()
  await assert.rejects(reviewCompany('company-1', 'admin-1', { status: 'approved' }, { userModel: createCompanyUserModel(), companyModel }), { errorCode: 'CONFLICT' })
  await updateCompanyProfile('company-1', validCompany, { companyModel })
  const approved = await reviewCompany('company-1', 'admin-1', { status: 'approved' }, { userModel: createCompanyUserModel(), companyModel })
  assert.equal(approved.approvalStatus, 'approved')
  assert.equal(approved.reviewedBy, 'admin-1')
  assert.equal(approved.rejectionReason, undefined)
  await assert.rejects(reviewCompany('company-1', 'admin-2', { status: 'rejected', rejectionReason: 'Duplicate account' }, { userModel: createCompanyUserModel(), companyModel }), { errorCode: 'CONFLICT' })
  await assert.rejects(reviewCompany('unknown', 'admin-1', { status: 'approved' }, { userModel: createCompanyUserModel(), companyModel }), { errorCode: 'NOT_FOUND' })
})

test('institution validation and service retain one shared singleton profile', async () => {
  const valid = institutionSchema.safeParse({ collegeName: 'Example Institute', logoUrl: 'https://example.test/logo.png', location: 'Pune', placementEmail: 'placements@example.test', placementPhone: '9876543210', branches: ['Computer Science', 'Information Technology'] })
  assert.equal(valid.success, true)
  assert.equal(institutionSchema.safeParse({ collegeName: '', branches: [] }).success, false)
  const institutionModel = createInstitutionModel()
  const initial = await getInstitutionProfile({ institutionModel })
  const updated = await updateInstitutionProfile({ collegeName: 'Example Institute', branches: ['Computer Science'] }, { institutionModel })
  assert.equal(initial, updated)
  assert.equal(updated.singletonKey, 'placementhub-v2')
  assert.equal(updated.collegeName, 'Example Institute')
})

test('M4 company and institution endpoints reject unauthenticated access', async () => {
  const server = app.listen(0)
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`
    for (const path of ['/api/v1/companies/me', '/api/v1/admin/companies', '/api/v1/admin/institution', '/api/v1/admin/companies/507f1f77bcf86cd799439011/participation-letter/download']) {
      const response = await fetch(`${baseUrl}${path}`)
      assert.equal(response.status, 401)
      assert.equal((await response.json()).errorCode, 'UNAUTHENTICATED')
    }
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('Admin letter lookup reuses Company documents and rejects absent letters or non-company accounts', async () => {
  const companyModel = createCompanyProfileModel()
  const userModel = createCompanyUserModel()
  await assert.rejects(getAdminParticipationLetter('unknown', { userModel, companyModel }), { errorCode: 'NOT_FOUND' })
  assert.equal(companyModel.profiles.length, 0)
  await assert.rejects(getAdminParticipationLetter('company-1', { userModel, companyModel }), { errorCode: 'NOT_FOUND' })
  await updateCompanyProfile('company-1', validCompany, { companyModel })
  assert.deepEqual(await getAdminParticipationLetter('company-1', { userModel, companyModel }), validCompany.participationLetter)
})

test('Admin letter route enforces roles and IDs and downloads the stored PDF', async (t) => {
  const { default: jwt } = await import('jsonwebtoken')
  const { writeFile, unlink } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { randomUUID } = await import('node:crypto')
  const { User } = await import('../src/modules/auth/auth.model.js')
  const { Company } = await import('../src/modules/companies/company.model.js')
  const { env } = await import('../src/config/env.js')
  const id = '507f1f77bcf86cd799439011'
  const filePath = join(tmpdir(), `company-letter-${randomUUID()}.pdf`)
  const content = '%PDF-1.7\nCompany participation letter'
  let role = USER_ROLES.COMPANY
  t.mock.method(User, 'findById', () => ({ select: async () => ({ _id: id, role, isActive: true }) }))
  t.mock.method(User, 'findOne', () => ({ select: async () => ({ _id: id }) }))
  t.mock.method(Company, 'findOneAndUpdate', async () => ({ participationLetter: { originalName: 'participation.pdf', storagePath: filePath } }))
  await writeFile(filePath, content)
  const server = app.listen(0)
  try {
    const base = `http://127.0.0.1:${server.address().port}/api/v1/admin/companies`
    const headers = { Authorization: `Bearer ${jwt.sign({}, env.JWT_SECRET, { subject: id, expiresIn: '1h' })}` }
    for (const deniedRole of [USER_ROLES.COMPANY, USER_ROLES.STUDENT]) {
      role = deniedRole
      assert.equal((await fetch(`${base}/${id}/participation-letter/download`, { headers })).status, 403)
    }
    role = USER_ROLES.PLACEMENT_ADMIN
    assert.equal((await fetch(`${base}/invalid/participation-letter/download`, { headers })).status, 422)
    const response = await fetch(`${base}/${id}/participation-letter/download`, { headers })
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-disposition'), /participation\.pdf/)
    assert.equal(await response.text(), content)
  } finally {
    await new Promise(resolve => server.close(resolve))
    await unlink(filePath)
  }
})
