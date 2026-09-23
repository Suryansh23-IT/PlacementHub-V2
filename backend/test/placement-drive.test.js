import assert from 'node:assert/strict'
import test from 'node:test'

process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/placementhub-v2-test'

const { PlacementDrive } = await import('../src/modules/placement-drives/placement-drive.model.js')
const { createPlacementDriveDraft, getApprovedCompanyForDrive } = await import('../src/modules/placement-drives/placement-drive.service.js')
const { placementDriveDraftSchema, placementDriveSubmissionSchema } = await import('../src/modules/placement-drives/placement-drive.validation.js')

const pdf = (name) => ({ originalName: name, storagePath: `/safe/${name}`, mimeType: 'application/pdf', size: 120, uploadedAt: new Date() })
const validDrive = {
  role: { title: 'Software Engineer', domain: 'Engineering', employmentType: 'full_time', description: 'Build and maintain software systems.', requiredSkills: ['JavaScript', 'Node.js'] },
  driveDetails: { workMode: 'hybrid', workLocation: 'Pune', expectedHires: 8, compensation: { amount: 900000, currency: 'INR', period: 'per_annum' }, applicationDeadline: new Date('2027-01-15'), joiningPeriod: 'July 2027' },
  eligibility: { minimumCgpa: 6.5, allowedBranches: ['Information Technology', 'Computer Science'], maximumActiveBacklogs: 0, graduationYears: [2027] },
  documents: { companyRecruitmentInformation: pdf('company-info.pdf'), placementDriveJobDescription: pdf('drive-jd.pdf') },
  phases: [{ phaseNumber: 1, title: 'Online assessment', type: 'assessment' }, { phaseNumber: 2, title: 'Technical interview', type: 'technical_interview' }],
}

test('PlacementDrive keeps one role and structured M5 proposal data without duplicating Company fields', async () => {
  const drive = new PlacementDrive({ ...validDrive, companyId: '507f1f77bcf86cd799439011' })
  await drive.validate()
  assert.equal(drive.companyId.toString(), '507f1f77bcf86cd799439011')
  assert.equal(drive.role.title, 'Software Engineer')
  assert.equal(drive.proposalStatus, 'draft')
  assert.equal(drive.lifecycleStatus, 'unpublished')
  assert.equal(drive.phases[0].phaseNumber, 1)
  assert.equal(drive.companyName, undefined)
  assert.equal(drive.recruiterEmail, undefined)
})

test('PlacementDrive validation reserves Phase 0 and requires one to five consecutive Company phases', async () => {
  assert.equal(placementDriveDraftSchema.safeParse(validDrive).success, true)
  for (const phases of [[], [{ phaseNumber: 0, title: 'Applicant pool', type: 'other' }], [{ phaseNumber: 2, title: 'Gap', type: 'other' }], Array.from({ length: 6 }, (_, index) => ({ phaseNumber: index + 1, title: `Phase ${index + 1}`, type: 'other' }))]) {
    assert.equal(placementDriveDraftSchema.safeParse({ ...validDrive, phases }).success, false)
  }
  await assert.rejects(new PlacementDrive({ ...validDrive, companyId: '507f1f77bcf86cd799439011', phases: [{ phaseNumber: 0, title: 'Applicant pool', type: 'other' }] }).validate())
})

test('submission structure requires both PDF metadata slots while drafts retain them separately', () => {
  assert.equal(placementDriveSubmissionSchema.safeParse(validDrive).success, true)
  const missingCompanyPdf = { ...validDrive, documents: { placementDriveJobDescription: validDrive.documents.placementDriveJobDescription } }
  const missingDrivePdf = { ...validDrive, documents: { companyRecruitmentInformation: validDrive.documents.companyRecruitmentInformation } }
  assert.equal(placementDriveDraftSchema.safeParse(missingCompanyPdf).success, true)
  assert.equal(placementDriveSubmissionSchema.safeParse(missingCompanyPdf).success, false)
  assert.equal(placementDriveSubmissionSchema.safeParse(missingDrivePdf).success, false)
})

test('approved Company lookup owns the Company reference and allows multiple drafts', async () => {
  const created = []
  const companyModel = { findOne: ({ userId, approvalStatus }) => ({ select: async () => userId === 'company-user' && approvalStatus === 'approved' ? { _id: 'company-profile' } : null }) }
  const placementDriveModel = { create: async (input) => { created.push(input); return input } }
  const dependencies = { companyModel, placementDriveModel, institutionService: async () => ({ branches: ['Information Technology', 'Computer Science'] }) }
  const first = await createPlacementDriveDraft('company-user', validDrive, dependencies)
  const second = await createPlacementDriveDraft('company-user', { ...validDrive, role: { ...validDrive.role, title: 'Data Engineer' } }, dependencies)
  assert.equal(created.length, 2)
  assert.equal(first.companyId, 'company-profile')
  assert.equal(second.companyId, 'company-profile')
  assert.equal(first.proposalStatus, 'draft')
  assert.equal(second.lifecycleStatus, 'unpublished')
  await assert.rejects(getApprovedCompanyForDrive('pending-company', { companyModel }), { errorCode: 'FORBIDDEN' })
})

test('PlacementDrive eligibility accepts only InstitutionProfile branch values', async () => {
  const companyModel = { findOne: () => ({ select: async () => ({ _id: 'company-profile' }) }) }
  const placementDriveModel = { create: async (input) => input }
  const dependencies = { companyModel, placementDriveModel, institutionService: async () => ({ branches: ['Information Technology'] }) }
  await assert.rejects(createPlacementDriveDraft('company-user', validDrive, dependencies), { errorCode: 'VALIDATION_ERROR' })
  const created = await createPlacementDriveDraft('company-user', { ...validDrive, eligibility: { ...validDrive.eligibility, allowedBranches: ['Information Technology'] } }, dependencies)
  assert.deepEqual(created.eligibility.allowedBranches, ['Information Technology'])
})

test('PlacementDrive indexes support Company proposal and lifecycle lookups', () => {
  const indexes = PlacementDrive.schema.indexes()
  assert.ok(indexes.some(([keys]) => keys.companyId === 1 && keys.proposalStatus === 1 && keys.lifecycleStatus === 1))
  assert.ok(indexes.some(([keys]) => keys['driveDetails.applicationDeadline'] === 1))
})
