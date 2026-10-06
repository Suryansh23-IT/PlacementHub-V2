import assert from 'node:assert/strict'
import test from 'node:test'
import ExcelJS from 'exceljs'

process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/placementhub-v2-test'
const { exportStudentExplorer, previewStudentExplorerNotification, sendStudentExplorerNotification } = await import('../src/modules/students/student.service.js')
const lean = values => ({ lean: async () => values })
const users = [{ _id: 's1', name: 'Asha Kumar', email: 'asha@example.test' }, { _id: 's2', name: 'Bharat Singh', email: 'bharat@example.test' }, { _id: 's3', name: 'Cia Das', email: 'cia@example.test' }]
const profiles = [{ userId: 's1', rollNumber: 'IT001', branch: 'IT', graduationYear: 2027, cgpa: 9, activeBacklogs: 0, verificationStatus: 'verified' }, { userId: 's2', rollNumber: 'CS002', branch: 'CSE', graduationYear: 2027, cgpa: 8, activeBacklogs: 0, verificationStatus: 'verified' }, { userId: 's3', rollNumber: 'IT003', branch: 'IT', graduationYear: 2027, cgpa: 7, activeBacklogs: 1, verificationStatus: 'pending' }]
const records = [{ studentId: 's1', companyId: 'c1', outcomeType: 'full_time', verificationState: 'confirmed' }, { studentId: 's2', companyId: 'c1', outcomeType: 'internship', verificationState: 'confirmed' }]
const applications = [{ studentId: 's1', placementDriveId: 'd1', currentPhase: 3, currentStatus: 'placement_confirmed' }, { studentId: 's2', placementDriveId: 'd1', currentPhase: 2, currentStatus: 'active' }]
const deps = { userModel: { find: () => ({ select: () => lean(users) }) }, profileModel: { find: () => lean(profiles) }, recordModel: { find: query => lean(records.filter(record => record.verificationState === query.verificationState)) }, applicationModel: { find: () => lean(applications) }, driveModel: { find: () => ({ select: () => lean([{ _id: 'd1', driveCode: 'DRV-1', role: { title: 'Engineer' } }]) }) }, companyModel: { find: () => ({ select: () => lean([{ _id: 'c1', companyName: 'Acme' }]) }) }, institutionService: async () => ({ collegeEligibility: { minimumCgpa: 7, maximumActiveBacklogs: 0, graduationYears: [2027] } }) }

test('Explorer selected/current/all exports preserve exact resolved identities and omit private fields', async () => {
  const selected = await exportStudentExplorer({ mode: 'selected', selectedStudentIds: ['s1', 's3'], filters: {} }, deps)
  const current = await exportStudentExplorer({ mode: 'current_view', filters: { branch: 'IT', page: 1, limit: 1 } }, deps)
  const matching = await exportStudentExplorer({ mode: 'all_matching', filters: { branch: 'IT' } }, deps)
  assert.deepEqual([selected.rowCount, current.rowCount, matching.rowCount], [2, 1, 2])
  assert.equal(matching.rowCount, new Set(['s1', 's3']).size)
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(selected.buffer)
  const sheet = workbook.getWorksheet('Students'); const headers = sheet.getRow(3).values.join('|')
  assert.match(headers, /Confirmed Company/); assert.doesNotMatch(headers, /storagePath|notes|_id/i)
})

test('Explorer recipient preview and filtered notification resolve the same cohort', async () => {
  const preview = await previewStudentExplorerNotification({ mode: 'all_matching', filters: { branch: 'IT' } }, deps)
  const created = []; const result = await sendStudentExplorerNotification('admin1', { mode: 'all_matching', filters: { branch: 'IT' }, title: 'Update', message: 'Please review.', requestId: '123e4567-e89b-12d3-a456-426614174000' }, { ...deps, notificationModel: { create: async values => { created.push(...values); return values } } })
  assert.equal(preview.recipientCount, 2); assert.deepEqual([result.recipientCount, created.map(item => item.recipientId).sort()], [2, ['s1', 's3']])
})

test('Explorer selected notification rejects stale IDs and preserves retry safety', async () => {
  await assert.rejects(previewStudentExplorerNotification({ mode: 'selected', selectedStudentIds: ['missing'], filters: {} }, deps), error => error.errorCode === 'VALIDATION_ERROR')
  const prior = [{ recipientId: 's1' }]
  const result = await sendStudentExplorerNotification('admin1', { mode: 'selected', selectedStudentIds: ['s1'], filters: {}, title: 'Update', message: 'Please review.', requestId: '123e4567-e89b-12d3-a456-426614174000' }, { ...deps, notificationModel: { create: async () => { const error = new Error('duplicate'); error.code = 11000; throw error }, find: () => ({ select: () => lean(prior) }) } })
  assert.deepEqual(result, { notificationsCreated: 1, recipientCount: 1, alreadySent: true, notificationBatchId: '123e4567-e89b-12d3-a456-426614174000' })
})
