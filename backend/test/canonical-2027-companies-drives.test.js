import assert from 'node:assert/strict'
import test from 'node:test'
import { CANONICAL_COMPANIES_2027, CANONICAL_DRIVE_PROPOSALS_2027, DEMO_2027_COMPANY_LOGIN_CONVENTION, validateCanonicalCompaniesAndDrives2027 } from '../data/demo-2027-m9/canonical-companies-drives.js'
import { DEMO_2027_BRANCHES } from '../data/demo-2027-m9/canonical-students.js'

test('M9A has the locked professional 2027 company mix and Gmail-style logins', () => {
  const result = validateCanonicalCompaniesAndDrives2027()
  assert.deepEqual(result.sectorCounts, { software_sde: 2, data_analytics: 1, core_engineering: 2 })
  assert.equal(result.companyCount, 5)
  assert.ok(result.companyLogins.every((email) => /^[a-z]+@gmail\.com$/.test(email)))
  assert.equal(DEMO_2027_COMPANY_LOGIN_CONVENTION.passwordEnvironmentVariable, 'DEMO_2027_COMPANY_PASSWORD')
})

test('M9A has six varied submitted and unpublished M10-ready drive proposals', () => {
  assert.equal(CANONICAL_DRIVE_PROPOSALS_2027.length, 6)
  assert.ok(CANONICAL_DRIVE_PROPOSALS_2027.every((drive) => drive.proposalStatus === 'submitted' && drive.lifecycleStatus === 'unpublished' && drive.role.requiredSkills.length && drive.role.preferredSkills.length && drive.documentPlan.jobDescription.length))
  assert.deepEqual(CANONICAL_DRIVE_PROPOSALS_2027.map((drive) => drive.phases.length), [4, 3, 3, 3, 4, 3])
  assert.ok(new Set(CANONICAL_DRIVE_PROPOSALS_2027.map((drive) => drive.phases.map((phase) => phase.title).join('|'))).size === 6)
  const dataAnalyst = CANONICAL_DRIVE_PROPOSALS_2027.find((drive) => drive.key === 'insightforge-data-analyst')
  assert.deepEqual(dataAnalyst.eligibility.allowedBranches, DEMO_2027_BRANCHES.map((branch) => branch.label))
  assert.deepEqual(dataAnalyst.role.requiredSkills, ['SQL', 'Excel', 'Data Analysis', 'Communication'])
  assert.deepEqual(dataAnalyst.role.preferredSkills, ['Python', 'Power BI', 'Statistics', 'Pandas'])
})

test('M9A company/drive validator rejects an accidentally published proposal or unknown branch', () => {
  const drives = CANONICAL_DRIVE_PROPOSALS_2027.map((drive) => ({ ...drive }))
  drives[0] = { ...drives[0], lifecycleStatus: 'published' }
  assert.throws(() => validateCanonicalCompaniesAndDrives2027({ drives }), /submitted and unpublished/)
  drives[0] = { ...CANONICAL_DRIVE_PROPOSALS_2027[0], eligibility: { ...CANONICAL_DRIVE_PROPOSALS_2027[0].eligibility, allowedBranches: ['Metallurgical Engineering'] } }
  assert.throws(() => validateCanonicalCompaniesAndDrives2027({ drives }), /unconfigured eligibility branch/)
})
