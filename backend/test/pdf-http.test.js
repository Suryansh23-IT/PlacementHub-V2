import test from 'node:test'
import assert from 'node:assert/strict'
import { StorageClient } from '@supabase/storage-js'
process.env.NODE_ENV = 'production'
process.env.MONGO_URI = 'mongodb://localhost/placementhub-v2-demo-2027'
process.env.JWT_SECRET = 'synthetic-pdf-http-secret-long-enough'
process.env.AI_ENABLED = 'false'
process.env.STORAGE_PROVIDER = 'supabase'
process.env.SUPABASE_STORAGE_BUCKET = 'placementhub-2027'
process.env.SUPABASE_URL = 'https://synthetic-project.supabase.co'
process.env.SUPABASE_SECRET_KEY = ['sb', 'secret', 'synthetic_pdf_http_fixture'].join('_')
const { app } = await import('../src/app.js')
const { env } = await import('../src/config/env.js')
const { User } = await import('../src/modules/auth/auth.model.js')
const { StudentProfile } = await import('../src/modules/students/student.model.js')
const { Company } = await import('../src/modules/companies/company.model.js')
const { PlacementDrive } = await import('../src/modules/placement-drives/placement-drive.model.js')
const { Application } = await import('../src/modules/applications/application.model.js')
const { PlacementRecord } = await import('../src/modules/placements/placement-record.model.js')
const { default: jwt } = await import('jsonwebtoken')
const ids = { student: '507f1f77bcf86cd799439001', admin: '507f1f77bcf86cd799439002', company: '507f1f77bcf86cd799439003', otherCompany: '507f1f77bcf86cd799439004', drive: '507f1f77bcf86cd799439005', companyProfile: '507f1f77bcf86cd799439006', application: '507f1f77bcf86cd799439007', record: '507f1f77bcf86cd799439008', otherStudent: '507f1f77bcf86cd799439009' }
const pdf = Buffer.from('%PDF-1.7\nHTTP PDF fixture')
const query = value => ({ select() { return this }, sort() { return this }, lean() { return this }, populate() { return this }, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject) } })
const safe = value => assert.doesNotMatch(JSON.stringify(value), /storageReference|storagePath|"provider"|"key"|supabase\.co|2027\/(class|college|participation|company|drive|recruitment|phase|placement)/)

test('all persistent PDF HTTP flows preserve fields, authorization, private delivery and DTOs', async t => {
  t.mock.method(console, 'error', () => {})
  t.mock.method(console, 'warn', () => {})
  const objects = new Map(); let calls = 0; let failSave = false; let exists = true; let approved = true; let cleanupFails = false
  const save = async function () { if (failSave) throw new Error('Synthetic failed save'); return this }
  const profile = { userId: ids.student, verificationStatus: 'verified', skills: [], save, toObject() { const { save, toObject, ...value } = this; return value } }
  const company = { _id: ids.companyProfile, userId: ids.company, approvalStatus: 'approved', save, toObject() { const { save, toObject, ...value } = this; return value } }
  const drive = { _id: ids.drive, companyId: ids.companyProfile, proposalStatus: 'draft', lifecycleStatus: 'unpublished', role: {}, driveDetails: {}, documents: {}, phases: [{ phaseNumber: 1, title: 'Interview', type: 'interview' }], phaseExecution: [], save }
  const record = { _id: ids.record, studentId: ids.student, applicationId: ids.application, verificationState: 'pending_admin_verification', proof: [], history: [], save }
  const application = { _id: ids.application, placementDriveId: ids.drive, studentId: ids.student, currentPhase: 1, currentStatus: 'active' }
  t.mock.method(StorageClient.prototype, 'getBucket', async () => { calls++; return { data: { id: 'placementhub-2027', public: false } } })
  t.mock.method(StorageClient.prototype, 'from', () => ({
    async upload(key, buffer, options) { calls++; assert.equal(options.upsert, false); objects.set(key, buffer); return { error: null } },
    async download(key) { calls++; assert.ok(objects.has(key)); return { data: new Blob([objects.get(key)]) } },
    async remove(keys) { calls++; if (cleanupFails) return { error: { statusCode: 500, message: 'synthetic private detail' } }; keys.forEach(key => objects.delete(key)); return { error: null } },
  }))
  const originalFetch = globalThis.fetch
  t.mock.method(globalThis, 'fetch', (url, options) => { assert.ok(String(url).startsWith('http://127.0.0.1:'), 'External network forbidden'); return originalFetch(url, options) })
  const roles = { [ids.student]: 'student', [ids.otherStudent]: 'student', [ids.admin]: 'placement_admin', [ids.company]: 'company', [ids.otherCompany]: 'company' }
  t.mock.method(User, 'findById', id => query(roles[id] ? { _id: id, role: roles[id], isActive: true } : null))
  t.mock.method(User, 'findOne', filter => query([ids.student, ids.company].includes(filter._id) ? { _id: filter._id, role: roles[filter._id] } : null))
  t.mock.method(User, 'find', () => query([{ _id: ids.company, role: 'company' }]))
  t.mock.method(StudentProfile, 'findOneAndUpdate', async filter => { if (!exists) throw new Error('Synthetic missing profile'); return filter.userId === ids.student ? profile : { userId: ids.otherStudent, skills: [] } })
  t.mock.method(StudentProfile, 'findOne', async filter => filter.userId === ids.student ? profile : null)
  t.mock.method(Company, 'findOneAndUpdate', async filter => { if (!exists) throw new Error('Synthetic missing company'); assert.equal(filter.userId, ids.company); return company })
  t.mock.method(Company, 'find', () => query([company]))
  t.mock.method(Company, 'findOne', filter => query(approved && (filter.userId === ids.company || filter._id === ids.companyProfile) ? company : null))
  t.mock.method(PlacementDrive, 'findOne', filter => query(exists && filter._id === ids.drive && (!filter.companyId || filter.companyId === ids.companyProfile) && (!filter.proposalStatus || filter.proposalStatus === drive.proposalStatus) && (!filter.lifecycleStatus || filter.lifecycleStatus === drive.lifecycleStatus) ? drive : null))
  t.mock.method(Application, 'findOne', async filter => filter.studentId === ids.student && (!filter._id || filter._id === ids.application) ? application : null)
  t.mock.method(Application, 'find', () => query([application]))
  t.mock.method(PlacementRecord, 'findOne', filter => query(exists && (!filter.studentId || filter.studentId === ids.student) && (!filter._id || filter._id === ids.record) && (!filter.applicationId || filter.applicationId === ids.application) ? record : null))
  t.mock.method(PlacementRecord, 'find', () => query([record]))
  const server = app.listen(0); t.after(() => new Promise(resolve => server.close(resolve)))
  const base = `http://127.0.0.1:${server.address().port}/api/v1`
  const headers = actor => ({ Authorization: `Bearer ${jwt.sign({}, env.JWT_SECRET, { subject: actor })}` })
  const form = (field, bytes = pdf, mime = 'application/pdf', name = 'document.pdf') => { const body = new FormData(); body.append(field, new Blob([bytes], { type: mime }), name); return body }
  const academic = ['class10', 'class12', 'collegeResult'].map(type => ({ category: { class10: 'class10', class12: 'class12', collegeResult: 'college-result' }[type], actor: ids.student, field: 'marksheet', upload: `/students/me/documents/${type}`, downloads: [[ids.student, `/students/me/documents/${type}/download`], [ids.admin, `/admin/students/${ids.student}/documents/${type}/download`]], metadata: () => type === 'collegeResult' ? profile.collegeResult : profile[type]?.marksheet }))
  const letter = { category: 'participation-letter', actor: ids.company, field: 'letter', upload: '/companies/me/participation-letter', downloads: [[ids.company, '/companies/me/participation-letter/download'], [ids.admin, `/admin/companies/${ids.company}/participation-letter/download`]], metadata: () => company.participationLetter }
  const drivePdfs = ['companyRecruitmentInformation', 'placementDriveJobDescription', 'recruitmentProcessInstructions'].map(type => ({ category: { companyRecruitmentInformation: 'company-recruitment-information', placementDriveJobDescription: 'drive-job-description', recruitmentProcessInstructions: 'recruitment-process-instructions' }[type], actor: ids.company, field: 'document', upload: `/companies/me/placement-drives/${ids.drive}/documents/${type}`, downloads: [[ids.company, `/companies/me/placement-drives/${ids.drive}/documents/${type}/download`], [ids.admin, `/admin/placement-drives/${ids.drive}/documents/${type}/download`], [ids.student, `/students/me/placement-drives/${ids.drive}/documents/${type}/download`]], metadata: () => drive.documents[type] }))
  const phase = { category: 'phase-instruction', actor: ids.company, field: 'document', upload: `/companies/me/placement-drives/${ids.drive}/recruitment/phases/1/instruction-pdf`, downloads: [[ids.company, `/companies/me/placement-drives/${ids.drive}/recruitment/phases/1/instruction-pdf/download`], [ids.student, `/students/me/applications/${ids.application}/current-phase/instruction-pdf/download`]], metadata: () => drive.phaseExecution[0]?.instructionPdf }
  const proof = { category: 'placement-proof', actor: ids.student, field: 'document', upload: `/students/me/applications/${ids.application}/placement-proof`, downloads: [[ids.student, `/students/me/placement-outcomes/${ids.record}/proofs/0/download`], [ids.admin, `/admin/placement-outcomes/${ids.record}/proofs/0/download`]], metadata: () => record.proof.at(-1) }
  const flows = [...academic, letter, ...drivePdfs, phase, proof]
  for (const flow of flows) {
    if (flow === phase) { drive.proposalStatus = 'approved'; drive.lifecycleStatus = 'published' }
    const beforeCalls = calls
    assert.equal((await fetch(base + flow.upload, { method: 'POST', body: form(flow.field) })).status, 401)
    const wrongRole = flow.actor === ids.student ? ids.company : ids.student
    assert.equal((await fetch(base + flow.upload, { method: 'POST', headers: headers(wrongRole), body: form(flow.field) })).status, 403)
    for (const body of [form('wrong'), form(flow.field, pdf, 'text/plain'), form(flow.field, pdf, 'application/pdf', 'document.txt'), form(flow.field, Buffer.from('invalid')), form(flow.field, Buffer.alloc(5242881))]) {
      const response = await fetch(base + flow.upload, { method: 'POST', headers: headers(flow.actor), body })
      assert.equal(response.status, flow === proof && body.get(flow.field)?.size === 7 ? 409 : 422, flow.category)
      safe(await response.json())
    }
    assert.equal(calls, beforeCalls)
    const response = await fetch(base + flow.upload, { method: 'POST', headers: headers(flow.actor), body: form(flow.field) })
    assert.equal(response.status, 201, flow.category); safe(await response.json())
    const committed = flow.metadata(); assert.equal(committed.storageReference.provider, 'supabase'); assert.equal(committed.storagePath, undefined)
    assert.ok(committed.storageReference.key.startsWith(`2027/${flow.category}/`))
    const beforeFailure = [...objects.keys()].sort(); failSave = true
    const failed = await fetch(base + flow.upload, { method: 'POST', headers: headers(flow.actor), body: form(flow.field) })
    assert.equal(failed.status, 500); safe(await failed.json()); failSave = false
    assert.deepEqual([...objects.keys()].sort(), beforeFailure); assert.deepEqual(flow.metadata(), committed)
    if (flow !== proof) {
      // Cloud cleanup failure leaves the new DB reference usable and response successful.
      cleanupFails = true
      const replaced = await fetch(base + flow.upload, { method: 'POST', headers: headers(flow.actor), body: form(flow.field) })
      assert.equal(replaced.status, 201); safe(await replaced.json()); cleanupFails = false
      assert.notEqual(flow.metadata().storageReference.key, committed.storageReference.key)
    }
  }
  drive.proposalStatus = 'approved'; drive.lifecycleStatus = 'published'
  for (const flow of flows) for (const [actor, endpoint] of flow.downloads) {
    const before = calls
    assert.equal((await fetch(base + endpoint)).status, 401); assert.equal(calls, before)
    const response = await fetch(base + endpoint, { headers: headers(actor) })
    assert.equal(response.status, 200, endpoint); assert.match(response.headers.get('content-disposition'), /attachment.*document\.pdf/)
    assert.equal(response.headers.get('content-type'), 'application/pdf'); assert.deepEqual(Buffer.from(await response.arrayBuffer()), pdf)
    assert.equal(response.headers.get('location'), null)
  }
  // Existing domain gates must reject before touching storage.
  const denied = async (actor, endpoint, method = 'GET', field = 'document') => {
    const before = calls; const response = await fetch(base + endpoint, { method, headers: headers(actor), ...(method === 'POST' ? { body: form(field) } : {}) })
    assert.ok(response.status >= 400, endpoint); safe(await response.json()); assert.equal(calls, before)
  }
  for (const flow of academic) { await denied(ids.otherStudent, flow.downloads[0][1]); await denied(ids.company, flow.downloads[1][1]) }
  for (const flow of [...drivePdfs, phase]) { await denied(ids.otherCompany, flow.upload, 'POST'); await denied(ids.otherCompany, flow.downloads[0][1]) }
  await denied(ids.otherStudent, proof.upload, 'POST'); await denied(ids.otherStudent, proof.downloads[0][1]); await denied(ids.company, proof.downloads[1][1])
  await denied(ids.otherStudent, phase.downloads[1][1])
  approved = false; await denied(ids.company, phase.upload, 'POST'); await denied(ids.company, phase.downloads[0][1]); approved = true
  drive.lifecycleStatus = 'unpublished'; await denied(ids.company, phase.upload, 'POST'); await denied(ids.student, phase.downloads[1][1]); await denied(ids.student, drivePdfs[0].downloads[2][1]); drive.lifecycleStatus = 'published'
  application.currentStatus = 'withdrawn'; await denied(ids.student, phase.downloads[1][1]); application.currentStatus = 'active'
  await denied(ids.company, drivePdfs[0].upload, 'POST') // Approved proposals are not editable.
  await denied(ids.company, phase.upload.replace('/phases/1/', '/phases/2/'), 'POST')
  exists = false; await denied(ids.student, proof.upload, 'POST'); await denied(ids.company, phase.upload, 'POST'); exists = true
  for (const endpoint of ['/companies/me', `/admin/companies`, `/companies/me/placement-drives/${ids.drive}`, `/admin/placement-drives/${ids.drive}`, `/companies/me/placement-drives/${ids.drive}/recruitment`, '/admin/placement-outcomes']) {
    const actor = endpoint.startsWith('/admin/') ? ids.admin : ids.company
    const response = await fetch(base + endpoint, { headers: headers(actor) }); assert.equal(response.status, 200, endpoint); safe(await response.json())
  }
  assert.equal(record.proof.length, 1, 'Proofs remain append-only, and a failed save does not append')
})
