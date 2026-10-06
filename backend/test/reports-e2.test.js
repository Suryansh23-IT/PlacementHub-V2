import assert from 'node:assert/strict'
import test from 'node:test'
import ExcelJS from 'exceljs'

process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/placementhub-v2-test'
const { exportAdminReport, getAdminReportPreview } = await import('../src/modules/analytics/reports.service.js')

const lean = values => ({ lean: async () => values })
const query = values => ({ select: () => lean(values), lean: async () => values })
const drive = { _id: 'd1', companyId: 'c1', driveCode: 'DRV-TCS-1', lifecycleStatus: 'published', role: { title: 'Engineer', employmentType: 'full_time' }, driveDetails: { workLocation: 'Pune', compensation: { amount: 1200000 }, applicationDeadline: new Date('2026-09-30') }, phases: [{ phaseNumber: 1, title: 'Technical / Round 1' }, { phaseNumber: 2, title: 'HR' }] }
const apps = [
  { _id: 'a1', studentId: 's1', placementDriveId: 'd1', currentPhase: 2, currentStatus: 'placement_confirmed', phaseHistory: [{ phase: 0, status: 'applied', event: 'applied', occurredAt: new Date('2026-09-01') }, { phase: 1, status: 'active', event: 'advanced', occurredAt: new Date('2026-09-03') }, { phase: 2, status: 'active', event: 'advanced', occurredAt: new Date('2026-09-08') }] },
  { _id: 'a2', studentId: 's2', placementDriveId: 'd1', currentPhase: 1, currentStatus: 'selected_pending_confirmation', phaseHistory: [{ phase: 0, status: 'applied', event: 'applied', occurredAt: new Date('2026-09-01') }, { phase: 1, status: 'active', event: 'advanced', occurredAt: new Date('2026-09-04') }] },
]
const records = [{ applicationId: 'a1', studentId: 's1', placementDriveId: 'd1', companyId: 'c1', verificationState: 'confirmed', outcomeType: 'full_time', role: 'Engineer', package: { amount: 1200000, currency: 'INR', period: 'per_annum' }, adminVerifiedAt: new Date('2026-09-12'), notes: 'private admin note', proof: [{ storagePath: 'private-storage-path' }] }, { applicationId: 'a2', studentId: 's2', placementDriveId: 'd1', companyId: 'c1', verificationState: 'revoked', outcomeType: 'ppo', role: 'Engineer' }]
const deps = { placementDriveModel: { findOne: async () => drive, find: () => lean([drive]) }, companyModel: { findOne: async () => ({ _id: 'c1', companyName: 'TCS' }), find: () => lean([{ _id: 'c1', companyName: 'TCS' }]) }, applicationModel: { find: () => lean(apps) }, placementRecordModel: { find: () => lean(records) }, userModel: { find: () => query([{ _id: 's1', name: 'Aarav', email: 'aarav@example.test' }, { _id: 's2', name: 'Diya', email: 'diya@example.test' }]) }, profileModel: { find: () => query([{ userId: 's1', rollNumber: 'IT1', branch: 'IT', cgpa: 9 }, { userId: 's2', rollNumber: 'CS1', branch: 'CSE', cgpa: 8 }]) } }

test('Complete drive report creates dynamic safe phase sheets and excludes revoked confirmations', async () => {
  const exported = await exportAdminReport({ type: 'complete_drive', drive: 'd1' }, deps)
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(exported.buffer)
  assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), ['Summary', 'Phase 0 - Applicants', 'Technical Round 1', 'HR', 'Selected', 'Confirmed'])
  for (const sheet of workbook.worksheets) { assert.ok(sheet.name.length <= 31); assert.doesNotMatch(sheet.name, /[\\/?*\[\]:]/); assert.ok(sheet.getRow(3).cellCount > 0); assert.equal(sheet.views[0]?.state, 'frozen') }
  assert.ok(workbook.getWorksheet('Phase 0 - Applicants').autoFilter)
  assert.equal(workbook.getWorksheet('Confirmed').rowCount, 4)
  assert.equal(workbook.getWorksheet('Confirmed').getRow(4).getCell(1).value, 'Aarav')
  assert.equal(JSON.stringify(workbook.model).includes('private-storage-path'), false)
  assert.equal(JSON.stringify(workbook.model).includes('private admin note'), false)
  assert.match(exported.filename, /DRV_TCS_1_complete_drive/)
})

test('Monthly report uses confirmation dates, preserves offers, and reports unique placement-equivalent students', async () => {
  const preview = await getAdminReportPreview({ type: 'monthly_placement', month: 9, year: 2026 }, deps)
  assert.equal(preview.matchingRecords, 1); assert.equal(preview.summary.uniquePlaced, 1)
  const exported = await exportAdminReport({ type: 'monthly_placement', month: 9, year: 2026 }, deps)
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(exported.buffer)
  assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), ['Summary', 'Companies', 'Students Placed', 'Branch Summary'])
  assert.equal(workbook.getWorksheet('Students Placed').getRow(4).getCell(1).value, 'Aarav')
  const customDay = await getAdminReportPreview({ type: 'monthly_placement', dateFrom: new Date('2026-09-12T00:00:00Z'), dateTo: new Date('2026-09-12T00:00:00Z') }, deps)
  assert.equal(customDay.matchingRecords, 1)
})

test('Monthly report counts a confirmed internship as placed while retaining unique-student totals', async () => {
  const internshipApp = { _id: 'a3', studentId: 's1', placementDriveId: 'd1', currentStatus: 'placement_confirmed', phaseHistory: [] }
  const internshipRecord = { applicationId: 'a3', studentId: 's1', placementDriveId: 'd1', companyId: 'c1', verificationState: 'confirmed', outcomeType: 'internship', role: 'Intern', package: { amount: 50000, currency: 'INR', period: 'per_month' }, adminVerifiedAt: new Date('2026-09-13') }
  const internshipDeps = { ...deps, applicationModel: { find: () => lean([...apps, internshipApp]) }, placementRecordModel: { find: () => lean([...records, internshipRecord]) } }
  const preview = await getAdminReportPreview({ type: 'monthly_placement', month: 9, year: 2026 }, internshipDeps)
  assert.equal(preview.summary.confirmedOffers, 2)
  assert.equal(preview.summary.uniquePlaced, 1)
})

test('Company reports use the shared scope and selection semantics', async () => {
  const preview = await getAdminReportPreview({ type: 'company_selections', company: 'c1' }, deps)
  assert.deepEqual(preview.summary, { selected: 2, confirmed: 1 })
  const exported = await exportAdminReport({ type: 'company_summary', company: 'c1' }, deps)
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(exported.buffer)
  assert.equal(workbook.getWorksheet('Company Summary').getRow(4).getCell(1).value, 'TCS')
  await assert.rejects(exportAdminReport({ type: 'complete_drive', drive: 'd1', company: 'another-company' }, deps), /does not belong/)
})
