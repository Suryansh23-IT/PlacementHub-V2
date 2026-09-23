import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/placementhub-v2-test'
process.env.JWT_SECRET = 'm5-placement-drive-test-secret-which-is-safely-long-enough'
process.env.CLIENT_URL = 'http://localhost:5173'

const { toPlacementDriveResponse } = await import('../src/modules/placement-drives/placement-drive.controller.js')
const { getMyPlacementDriveDocument, resubmitMyPlacementDrive, reviewPlacementDriveProposal, saveMyPlacementDriveDocument, submitMyPlacementDrive, updateMyPlacementDrive } = await import('../src/modules/placement-drives/placement-drive.service.js')
const { placementDriveCreateSchema, placementDriveReviewSchema } = await import('../src/modules/placement-drives/placement-drive.validation.js')

const pdf = (name) => ({ originalName: name, storagePath: `/safe/${name}`, mimeType: 'application/pdf', size: 120, uploadedAt: new Date() })
const input = {
  role: { title: 'Software Engineer', employmentType: 'full_time', description: 'Build systems used by customers.', requiredSkills: ['JavaScript'] },
  driveDetails: { workMode: 'hybrid', workLocation: 'Pune', expectedHires: 5, applicationDeadline: new Date('2027-02-01') },
  eligibility: { minimumCgpa: 6, allowedBranches: ['Information Technology'], maximumActiveBacklogs: 0, graduationYears: [2027] },
  phases: [{ phaseNumber: 1, title: 'Assessment', type: 'assessment' }],
}

function dependencies(drive, { approved = true, policyAccepted = true } = {}) {
  const companyModel = { findOne: () => ({ select: async () => approved ? { _id: 'company-profile' } : null }) }
  const placementDriveModel = { findOne: async () => drive }
  const policyDependencies = {
    policyModel: { findOne: async () => ({ _id: 'active-policy', version: '1.0' }) },
    acceptanceModel: { findOne: async () => policyAccepted ? { companyId: 'company-user', policyId: 'active-policy', policyVersion: '1.0' } : null },
  }
  return { companyModel, placementDriveModel, policyDependencies, institutionService: async () => ({ branches: ['Information Technology'] }) }
}

function drive({ proposalStatus = 'draft', documents = {}, lifecycleStatus = 'unpublished' } = {}) {
  return {
    _id: '507f1f77bcf86cd799439011', ...structuredClone(input), documents, proposalStatus, lifecycleStatus, review: {},
    async save() { return this },
    toObject() { return { ...this } },
  }
}

test('Company create/update payloads cannot set PDF storage metadata directly', () => {
  const parsed = placementDriveCreateSchema.parse({ ...input, documents: { companyRecruitmentInformation: pdf('unsafe.pdf') } })
  assert.equal(parsed.documents, undefined)
  assert.equal(placementDriveCreateSchema.safeParse({ ...input, phases: [{ phaseNumber: 0, title: 'Screening', type: 'other' }] }).success, false)
})

test('only approved Companies can edit their own draft or changes-requested proposal', async () => {
  const draft = drive()
  const saved = await updateMyPlacementDrive('company-user', draft._id, { ...input, role: { ...input.role, title: 'Platform Engineer' } }, dependencies(draft))
  assert.equal(saved.role.title, 'Platform Engineer')
  await assert.rejects(updateMyPlacementDrive('company-user', draft._id, input, dependencies(draft, { approved: false })), { errorCode: 'FORBIDDEN' })
  draft.proposalStatus = 'submitted'
  await assert.rejects(updateMyPlacementDrive('company-user', draft._id, input, dependencies(draft)), { errorCode: 'CONFLICT' })
})

test('submission requires active Recruiter policy acceptance and both uploaded PDFs', async () => {
  const missingDocuments = drive()
  await assert.rejects(submitMyPlacementDrive('company-user', missingDocuments._id, dependencies(missingDocuments)), { errorCode: 'CONFLICT' })
  const noPolicy = drive({ documents: { companyRecruitmentInformation: pdf('company.pdf'), placementDriveJobDescription: pdf('drive.pdf') } })
  await assert.rejects(submitMyPlacementDrive('company-user', noPolicy._id, dependencies(noPolicy, { policyAccepted: false })), { errorCode: 'FORBIDDEN' })
  const submitted = drive({ documents: { companyRecruitmentInformation: pdf('company.pdf'), placementDriveJobDescription: pdf('drive.pdf') } })
  await submitMyPlacementDrive('company-user', submitted._id, dependencies(submitted))
  assert.equal(submitted.proposalStatus, 'submitted')
  assert.deepEqual(submitted.review, {})
})

test('Admin review supports approve, reject, and request changes only from submitted', async () => {
  assert.equal(placementDriveReviewSchema.safeParse({ decision: 'rejected' }).success, false)
  assert.equal(placementDriveReviewSchema.safeParse({ decision: 'approved', reason: 'No reason' }).success, false)
  for (const [decision, expectedStatus, reviewField] of [['approved', 'approved', undefined], ['rejected', 'rejected', 'rejectionReason'], ['changes_requested', 'changes_requested', 'requestedChanges']]) {
    const proposal = drive({ proposalStatus: 'submitted' })
    await reviewPlacementDriveProposal(proposal._id, 'admin-user', { decision, ...(reviewField ? { reason: 'Please revise the proposal.' } : {}) }, dependencies(proposal))
    assert.equal(proposal.proposalStatus, expectedStatus)
    assert.equal(proposal.review.reviewedBy, 'admin-user')
    if (reviewField) assert.equal(proposal.review[reviewField], 'Please revise the proposal.')
  }
  const draft = drive()
  await assert.rejects(reviewPlacementDriveProposal(draft._id, 'admin-user', { decision: 'approved' }, dependencies(draft)), { errorCode: 'CONFLICT' })
})

test('only changes-requested proposals can resubmit, retaining the reserved unpublished lifecycle', async () => {
  const changed = drive({ proposalStatus: 'changes_requested', documents: { companyRecruitmentInformation: pdf('company.pdf'), placementDriveJobDescription: pdf('drive.pdf') } })
  await resubmitMyPlacementDrive('company-user', changed._id, dependencies(changed))
  assert.equal(changed.proposalStatus, 'submitted')
  assert.equal(changed.lifecycleStatus, 'unpublished')
  await assert.rejects(resubmitMyPlacementDrive('company-user', changed._id, dependencies(changed)), { errorCode: 'CONFLICT' })
})

test('draft document uploads validate PDF content, replace only an editable document, and hide storage paths in responses', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'placementhub-drive-document-'))
  const filePath = path.join(directory, 'company.pdf')
  await writeFile(filePath, '%PDF-1.7\ncompany information')
  const proposal = drive()
  try {
    await saveMyPlacementDriveDocument('company-user', proposal._id, 'companyRecruitmentInformation', { originalname: 'company.pdf', path: filePath, mimetype: 'application/pdf', size: 28 }, dependencies(proposal))
    assert.equal((await getMyPlacementDriveDocument('company-user', proposal._id, 'companyRecruitmentInformation', dependencies(proposal))).originalName, 'company.pdf')
    const response = toPlacementDriveResponse(proposal)
    assert.equal(response.documents.companyRecruitmentInformation.storagePath, undefined)
    proposal.proposalStatus = 'submitted'
    const replacement = path.join(directory, 'replacement.pdf')
    await writeFile(replacement, '%PDF-1.7\nreplacement')
    await assert.rejects(saveMyPlacementDriveDocument('company-user', proposal._id, 'companyRecruitmentInformation', { originalname: 'replacement.pdf', path: replacement, mimetype: 'application/pdf', size: 20 }, dependencies(proposal)), { errorCode: 'CONFLICT' })
    await assert.rejects(readFile(replacement), { code: 'ENOENT' })
  } finally { await (await import('node:fs/promises')).rm(directory, { recursive: true, force: true }) }
})

test('M5 proposal endpoints require authentication', async () => {
  const { app } = await import('../src/app.js')
  const server = app.listen(0)
  try {
    const base = `http://127.0.0.1:${server.address().port}/api/v1`
    for (const path of ['/companies/me/placement-drives', '/admin/placement-drives']) {
      const response = await fetch(`${base}${path}`)
      assert.equal(response.status, 401)
      assert.equal((await response.json()).errorCode, 'UNAUTHENTICATED')
    }
  } finally { await new Promise(resolve => server.close(resolve)) }
})
