import test from 'node:test'
import assert from 'node:assert/strict'
import { StorageClient } from '@supabase/storage-js'
process.env.NODE_ENV = 'production'
process.env.MONGO_URI = 'mongodb://localhost/placementhub-v2-demo-2027'
process.env.JWT_SECRET = 'synthetic-resume-http-secret-long-enough'
process.env.AI_ENABLED = 'false'
process.env.STORAGE_PROVIDER = 'supabase'
process.env.SUPABASE_URL = 'https://synthetic-project.supabase.co'
process.env.SUPABASE_SECRET_KEY = ['sb', 'secret', 'synthetic_resume_http_fixture'].join('_')
const { app } = await import('../src/app.js')
const { env } = await import('../src/config/env.js')
const { User } = await import('../src/modules/auth/auth.model.js')
const { StudentProfile } = await import('../src/modules/students/student.model.js')
const { Company } = await import('../src/modules/companies/company.model.js')
const { PlacementDrive } = await import('../src/modules/placement-drives/placement-drive.model.js')
const { Application } = await import('../src/modules/applications/application.model.js')
const { default: jwt } = await import('jsonwebtoken')
const ids = { student: '507f1f77bcf86cd799439001', admin: '507f1f77bcf86cd799439002', company: '507f1f77bcf86cd799439003', other: '507f1f77bcf86cd799439004', drive: '507f1f77bcf86cd799439005', companyProfile: '507f1f77bcf86cd799439006' }
const pdf = Buffer.from('%PDF-1.7\nHTTP resume fixture')
const query = value => ({ select() { return this }, sort() { return Promise.resolve(value) }, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject) } })

test('production resume HTTP preserves multipart/DTO/download contracts and Student/Admin/Company authorization', async t => {
  const objects = new Map(); let storageCalls = 0; let approved = true; let published = true; let exists = true
  const profile = { userId: ids.student, verificationStatus: 'verified', skills: [], async save() { return this } }
  t.mock.method(StorageClient.prototype, 'getBucket', async () => { storageCalls++; return { data: { id: 'placementhub-2027', public: false } } })
  t.mock.method(StorageClient.prototype, 'from', () => ({
    async upload(key, buffer, options) { storageCalls++; assert.equal(options.upsert, false); objects.set(key, buffer); return { error: null } },
    async download(key) { storageCalls++; return { data: new Blob([objects.get(key)]) } },
    async remove(keys) { storageCalls++; keys.forEach(key => objects.delete(key)); return { error: null } },
  }))
  const originalFetch = globalThis.fetch
  t.mock.method(globalThis, 'fetch', (url, options) => {
    assert.ok(String(url).startsWith('http://127.0.0.1:'), 'External network forbidden')
    return originalFetch(url, options)
  })
  const actors = { [ids.student]: 'student', [ids.admin]: 'placement_admin', [ids.company]: 'company', [ids.other]: 'company' }
  t.mock.method(User, 'findById', id => query(actors[id] ? { _id: id, role: actors[id], isActive: true } : null))
  t.mock.method(User, 'findOne', filter => query(filter._id === ids.student ? { _id: ids.student, role: 'student', name: 'Fixture Student' } : null))
  t.mock.method(StudentProfile, 'findOneAndUpdate', async filter => { assert.equal(filter.userId, ids.student); return profile })
  t.mock.method(StudentProfile, 'findOne', async filter => filter.userId === ids.student ? profile : null)
  t.mock.method(Company, 'findOne', async filter => approved && filter.userId === ids.company ? { _id: ids.companyProfile, approvalStatus: 'approved' } : null)
  t.mock.method(PlacementDrive, 'findOne', async filter => filter._id === ids.drive && filter.companyId === ids.companyProfile ? { _id: ids.drive, companyId: ids.companyProfile, proposalStatus: 'approved', lifecycleStatus: published ? 'published' : 'unpublished', role: {}, driveDetails: {} } : null)
  t.mock.method(Application, 'findOne', async filter => exists && filter.studentId === ids.student ? { _id: 'fixture', placementDriveId: ids.drive, studentId: ids.student, currentPhase: 1 } : null)
  t.mock.method(Application, 'find', () => query([{ _id: 'fixture', placementDriveId: ids.drive, studentId: ids.student, currentPhase: 1 }]))
  const server = app.listen(0); t.after(() => new Promise(resolve => server.close(resolve)))
  const base = `http://127.0.0.1:${server.address().port}/api/v1`
  const headers = actor => ({ Authorization: `Bearer ${jwt.sign({}, env.JWT_SECRET, { subject: actor })}` })
  const form = (bytes = pdf, mime = 'application/pdf', name = 'resume.pdf', field = 'resume') => {
    const data = new FormData(); data.append(field, new Blob([bytes], { type: mime }), name); return data
  }
  const upload = '/students/me/resume'
  assert.equal((await fetch(base + upload, { method: 'POST', body: form() })).status, 401)
  for (const actor of [ids.company, ids.admin]) assert.equal((await fetch(base + upload, { method: 'POST', headers: headers(actor), body: form() })).status, 403)
  for (const body of [form(pdf, 'text/plain'), form(pdf, 'application/pdf', 'resume.txt'), form(Buffer.from('not a PDF')), form(pdf, 'application/pdf', 'resume.pdf', 'wrong'), form(Buffer.alloc(5242881))]) {
    assert.equal((await fetch(base + upload, { method: 'POST', headers: headers(ids.student), body })).status, 422)
  }
  assert.equal(storageCalls, 0)
  const saved = await fetch(base + upload, { method: 'POST', headers: headers(ids.student), body: form() })
  assert.equal(saved.status, 201)
  const payload = await saved.json()
  assert.equal(payload.data.resume.downloadUrl, '/api/v1/students/me/resume/download')
  assert.equal(payload.data.resume.originalName, 'resume.pdf')
  assert.equal(payload.data.resume.size, pdf.length)
  assert.equal(profile.verificationStatus, 'verified')
  assert.equal(payload.data.resume.storageReference, undefined)
  assert.equal(payload.data.resume.storagePath, undefined)
  assert.ok(!JSON.stringify(payload).includes('2027/resume/'))
  const own = '/students/me/resume/download'
  const admin = `/admin/students/${ids.student}/documents/resume/download`
  const company = `/companies/me/placement-drives/${ids.drive}/applicants/${ids.student}/resume/download`
  for (const [url, actor] of [[own, ids.student], [admin, ids.admin], [company, ids.company]]) {
    const response = await fetch(base + url, { headers: headers(actor) })
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type'), /application\/pdf/)
    assert.match(response.headers.get('content-disposition'), /attachment;.*resume\.pdf/)
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), pdf)
  }
  for (const url of [company.replace('/resume/download', ''), `/companies/me/placement-drives/${ids.drive}/recruitment/candidates`]) {
    const response = await fetch(base + url, { headers: headers(ids.company) })
    assert.equal(response.status, 200)
    const text = await response.text()
    assert.ok(text.includes('resume.pdf'))
    assert.ok(!/storageReference|storagePath|2027\/resume\//.test(text))
  }
  const count = storageCalls
  assert.equal((await fetch(base + own)).status, 401)
  assert.equal((await fetch(base + own, { headers: headers(ids.company) })).status, 403)
  assert.equal((await fetch(base + admin, { headers: headers(ids.student) })).status, 403)
  assert.equal((await fetch(base + company, { headers: headers(ids.student) })).status, 403)
  assert.equal((await fetch(base + company, { headers: headers(ids.other) })).status, 403)
  assert.equal((await fetch(base + admin.replace(ids.student, ids.other), { headers: headers(ids.admin) })).status, 404)
  assert.equal((await fetch(base + company.replace(ids.drive, ids.other), { headers: headers(ids.company) })).status, 404)
  assert.equal((await fetch(base + company.replace(ids.student, ids.other), { headers: headers(ids.company) })).status, 404)
  approved = false; assert.equal((await fetch(base + company, { headers: headers(ids.company) })).status, 403); approved = true
  published = false; assert.equal((await fetch(base + company, { headers: headers(ids.company) })).status, 409); published = true
  exists = false; assert.equal((await fetch(base + company, { headers: headers(ids.company) })).status, 404)
  assert.equal(storageCalls, count)
  assert.equal(objects.size, 1)
})
