import assert from 'node:assert/strict'
import test from 'node:test'

process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/placementhub-v2-test'

const { getCompanyDriveApplicant, getCompanyDriveApplicantResume, listCompanyDriveApplicants } = await import('../src/modules/applications/company-drive-applicant.service.js')

const ids = {
  companyUser: '507f1f77bcf86cd799439001',
  otherCompanyUser: '507f1f77bcf86cd799439002',
  company: '507f1f77bcf86cd799439003',
  otherCompany: '507f1f77bcf86cd799439004',
  drive: '507f1f77bcf86cd799439005',
  otherDrive: '507f1f77bcf86cd799439006',
  student: '507f1f77bcf86cd799439007',
  otherStudent: '507f1f77bcf86cd799439008',
}

const application = { _id: 'application-1', studentId: ids.student, placementDriveId: ids.drive, appliedAt: new Date('2027-01-10T09:00:00.000Z'), currentPhase: 0, currentStatus: 'applied' }
const drive = { _id: ids.drive, companyId: ids.company, proposalStatus: 'approved', lifecycleStatus: 'published', role: { title: 'Software Engineer' }, driveDetails: { workLocation: 'Raipur', applicationDeadline: new Date('2027-02-01') } }
const profile = {
  userId: ids.student,
  rollNumber: '21115001',
  branch: 'Information Technology',
  cgpa: 8.4,
  activeBacklogs: 0,
  graduationYear: 2027,
  skills: ['JavaScript'],
  skillGroups: [{ name: 'Web', skills: ['React'] }],
  projects: [{ title: 'PlacementHub', description: 'Placement management app.', technologies: ['React'] }],
  professionalLinks: { github: 'https://github.com/student' },
  codingProfiles: [{ platform: 'LeetCode', url: 'https://leetcode.com/student' }],
  resume: { originalName: 'resume.pdf', storagePath: '/private/resumes/student.pdf', mimeType: 'application/pdf', size: 100, uploadedAt: new Date('2027-01-01') },
}

function dependencies({ lifecycleStatus = 'published', applications = [application] } = {}) {
  const companies = [
    { _id: ids.company, userId: ids.companyUser, approvalStatus: 'approved', companyName: 'Acme Technologies' },
    { _id: ids.otherCompany, userId: ids.otherCompanyUser, approvalStatus: 'approved' },
  ]
  const drives = [{ ...drive, lifecycleStatus }, { ...drive, _id: ids.otherDrive, companyId: ids.otherCompany }]
  return {
    companyModel: { findOne: async query => companies.find(company => company.userId === query.userId && company.approvalStatus === query.approvalStatus) ?? null },
    placementDriveModel: { findOne: async query => drives.find(item => String(item._id) === String(query._id) && String(item.companyId) === String(query.companyId)) ?? null },
    applicationModel: {
      find: query => ({ sort: async () => applications.filter(item => String(item.placementDriveId) === String(query.placementDriveId) && item.currentPhase === query.currentPhase && (!query.currentStatus?.$ne || item.currentStatus !== query.currentStatus.$ne)) }),
      findOne: async query => applications.find(item => String(item.placementDriveId) === String(query.placementDriveId) && String(item.studentId) === String(query.studentId) && (query.currentPhase == null || item.currentPhase === query.currentPhase) && (!query.currentStatus?.$ne || item.currentStatus !== query.currentStatus.$ne)) ?? null,
    },
    userModel: { findOne: async query => query._id === ids.student && query.role === 'student' ? { _id: ids.student, name: 'Priya Student' } : null },
    profileModel: { findOne: async ({ userId }) => userId === ids.student ? profile : null },
  }
}

test('Company sees only Phase 0 applicant data needed for recruitment, without storage paths', async () => {
  const result = await listCompanyDriveApplicants(ids.companyUser, ids.drive, dependencies())
  assert.equal(result.drive.role.title, 'Software Engineer')
  assert.equal(result.applicants.length, 1)
  const [applicant] = result.applicants
  assert.equal(applicant.student.name, 'Priya Student')
  assert.equal(applicant.student.rollNumber, '21115001')
  assert.equal(applicant.currentPhase, 0)
  assert.equal(applicant.currentStatus, 'applied')
  assert.equal(applicant.student.resume.storagePath, undefined)
  assert.equal(result.drive.company.companyName, 'Acme Technologies')
  assert.equal(result.drive.lifecycleStatus, 'published')
  assert.equal(result.drive.applicationWindow.open, true)
  assert.match(applicant.student.resume.downloadUrl, /applicants\/.+\/resume\/download$/)
})

test('Company can view an applicant recruitment profile and securely resolve only that applicant resume', async () => {
  const options = dependencies()
  const applicant = await getCompanyDriveApplicant(ids.companyUser, ids.drive, ids.student, options)
  assert.deepEqual(applicant.student.skills, ['JavaScript'])
  assert.equal(applicant.student.projects[0].title, 'PlacementHub')
  assert.equal(applicant.student.professionalLinks.github, 'https://github.com/student')
  assert.equal(applicant.drive.company.companyName, 'Acme Technologies')
  assert.equal(applicant.drive.driveDetails.applicationDeadline.toISOString(), '2027-02-01T00:00:00.000Z')
  assert.equal(applicant.student.resume.storagePath, undefined)
  const resume = await getCompanyDriveApplicantResume(ids.companyUser, ids.drive, ids.student, options)
  assert.equal(resume.storagePath, '/private/resumes/student.pdf')
})

test('Company can view a candidate profile from every current recruitment phase', async () => {
  for (const phaseNumber of [0, 1, 2, 3, 4, 5]) {
    const phaseApplication = { ...application, currentPhase: phaseNumber, currentStatus: 'active' }
    const applicant = await getCompanyDriveApplicant(ids.companyUser, ids.drive, ids.student, dependencies({ applications: [phaseApplication] }))
    assert.equal(applicant.currentPhase, phaseNumber)
    assert.equal(applicant.currentStatus, 'active')
    assert.equal(applicant.student.resume.storagePath, undefined)
  }
})

test('Company applicant access is restricted to its own published Placement Drive', async () => {
  await assert.rejects(listCompanyDriveApplicants(ids.otherCompanyUser, ids.drive, dependencies()), { errorCode: 'NOT_FOUND' })
  await assert.rejects(listCompanyDriveApplicants(ids.companyUser, ids.drive, dependencies({ lifecycleStatus: 'unpublished' })), { errorCode: 'CONFLICT' })
  await assert.rejects(getCompanyDriveApplicant(ids.companyUser, ids.drive, ids.otherStudent, dependencies()), { errorCode: 'NOT_FOUND' })
})

test('Withdrawn Applications leave the active Phase 0 pool but remain in Company exited history', async () => {
  const withdrawn = { ...application, currentStatus: 'withdrawn' }
  const list = await listCompanyDriveApplicants(ids.companyUser, ids.drive, dependencies({ applications: [withdrawn] }))
  assert.equal(list.applicants.length, 0)
  assert.equal(list.exited.length, 1)
  const exited = await getCompanyDriveApplicant(ids.companyUser, ids.drive, ids.student, dependencies({ applications: [withdrawn] }))
  assert.equal(exited.currentStatus, 'withdrawn')
})
