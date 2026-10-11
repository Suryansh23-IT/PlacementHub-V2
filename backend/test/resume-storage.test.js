import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
process.env.MONGO_URI = 'mongodb://localhost/placementhub-v2-test'
process.env.JWT_SECRET = 'synthetic-resume-test-secret-long-enough'
const { createResumeStorage, publicResumeMetadata } = await import('../src/modules/students/resume-storage.js')
const { saveResume } = await import('../src/modules/students/student.service.js')
const { StudentProfile } = await import('../src/modules/students/student.model.js')
const { toProfileResponse } = await import('../src/modules/students/student.controller.js')
const { createResumeTextService } = await import('../src/modules/ai/resume-text.service.js')
const pdf = Buffer.from('%PDF-1.7\nresume fixture')
const file = { originalname: 'resume.pdf', mimetype: 'application/pdf', buffer: pdf, size: pdf.length }
const cloudConfig = { NODE_ENV: 'production', MONGO_URI: 'mongodb://localhost/placementhub-v2-demo-2027', SUPABASE_URL: 'https://synthetic-project.supabase.co', SUPABASE_SECRET_KEY: ['sb', 'secret', 'synthetic_resume_fixture_only'].join('_') }

function profileFixture(resume) {
  const events = []
  const profile = { resume, verificationStatus: 'verified', reviewedBy: 'admin', reviewedAt: new Date(0), async save() { events.push('save'); return this } }
  const profileModel = { async findOneAndUpdate(filter) { assert.equal(filter.userId, 'student'); return profile } }
  return { profile, profileModel, events }
}
async function local(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'placementhub-e2-resume-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return { directory, config: { NODE_ENV: 'test', RESUME_UPLOAD_DIR: directory }, storage: createResumeStorage({ NODE_ENV: 'test', RESUME_UPLOAD_DIR: directory }) }
}
function cloud() {
  const files = new Map(); const events = []
  const client = {
    getBucket: async () => ({ data: { id: 'placementhub-2027', public: false } }),
    from: () => ({
      async upload(key, buffer) { events.push('store'); files.set(key, buffer); return { error: null } },
      async download(key) { return files.has(key) ? { data: new Blob([files.get(key)]) } : { error: { statusCode: 404 } } },
      async remove(keys) { events.push('remove'); keys.forEach(key => files.delete(key)); return { error: null } },
    }),
  }
  return { files, events, storage: createResumeStorage(cloudConfig, { client }) }
}

test('new local resume upload stores generated references, reads/removes bytes and retains local AI extraction', async t => {
  const { directory, config, storage } = await local(t)
  const { profile, profileModel } = profileFixture()
  await saveResume('student', file, { profileModel, resumeStorage: storage })
  assert.equal(profile.resume.storageReference.provider, 'local')
  assert.equal(path.dirname(profile.resume.storagePath), directory)
  assert.deepEqual(await storage.read(profile.resume), pdf)
  assert.deepEqual(await readFile(profile.resume.storagePath), pdf)
  const extractor = createResumeTextService({ ...config, MONGO_URI: 'mongodb://localhost/placementhub-v2-demo-2027', AI_ENABLED: true }, { parsePdf: async () => ({ text: 'Projects\nBuilt reliable backend APIs with SQL and Node.js for professional software projects.' }) })
  assert.equal((await extractor.extract(profile.resume)).status, 'extracted')
  await storage.remove(profile.resume)
  assert.deepEqual(await readdir(directory), [])
})

test('legacy nested local metadata reads without mutation and is removed only after replacement saves', async t => {
  const { directory, storage } = await local(t)
  const nested = path.join(directory, 'legacy-fixture'); await mkdir(nested)
  const storagePath = path.join(nested, 'old.pdf'); await writeFile(storagePath, pdf)
  const old = { originalName: 'old.pdf', storagePath, size: pdf.length, mimeType: 'application/pdf', uploadedAt: new Date(0) }
  assert.deepEqual(await storage.read(old), pdf)
  assert.equal(old.storageReference, undefined)
  const { profile, profileModel } = profileFixture(old)
  profile.save = async () => { assert.deepEqual(await storage.read(old), pdf); assert.deepEqual(await storage.read(profile.resume), pdf); return profile }
  await saveResume('student', file, { profileModel, resumeStorage: storage })
  await assert.rejects(readFile(storagePath), { code: 'ENOENT' })
  assert.deepEqual(await storage.read(profile.resume), pdf)
  assert.equal(profile.verificationStatus, 'verified'); assert.equal(profile.reviewedBy, 'admin')
})

test('private cloud references persist without local paths or exposed DTO storage details', async () => {
  const { storage, files } = cloud(); const { profile, profileModel } = profileFixture()
  await saveResume('student', file, { profileModel, resumeStorage: storage })
  assert.equal(profile.resume.storagePath, undefined)
  assert.equal(profile.resume.storageReference.provider, 'supabase')
  assert.equal(files.size, 1)
  assert.deepEqual(await storage.read(profile.resume), pdf)
  const response = toProfileResponse(profile, { includeResumeDownloadUrl: true })
  assert.deepEqual(response.resume, { ...publicResumeMetadata(profile.resume), downloadUrl: '/api/v1/students/me/resume/download' })
  assert.ok(!JSON.stringify(response).includes('2027/resume/'))
  assert.equal(response.resume.storageReference, undefined)
})

test('replacement ordering is store then DB save then old-object removal', async () => {
  const fixture = cloud(); const old = await fixture.storage.store({ buffer: pdf, mimeType: 'application/pdf' })
  fixture.events.length = 0
  const { profile, profileModel } = profileFixture(old)
  profile.save = async () => { fixture.events.push('save'); assert.equal(fixture.files.size, 2); return profile }
  await saveResume('student', file, { profileModel, resumeStorage: fixture.storage })
  assert.deepEqual(fixture.events, ['store', 'save', 'remove'])
  assert.equal(fixture.files.size, 1)
  assert.ok(!fixture.files.has(old.storageReference.key))
})

for (const provider of ['local', 'supabase']) test(`${provider} failed DB save retains old metadata/file and removes only new file`, async t => {
  const fixture = provider === 'local' ? await local(t) : cloud()
  const old = await fixture.storage.store({ buffer: pdf, mimeType: 'application/pdf' })
  const { profile, profileModel } = profileFixture(old)
  profile.save = async () => { throw Error('Synthetic save failure') }
  await assert.rejects(saveResume('student', file, { profileModel, resumeStorage: fixture.storage }), /Synthetic save failure/)
  assert.equal(profile.resume, old)
  assert.deepEqual(await fixture.storage.read(old), pdf)
  assert.equal(provider === 'local' ? (await readdir(fixture.directory)).length : fixture.files.size, 1)
})

test('cleanup failure cannot undo a committed replacement or mask the original DB failure', async () => {
  for (const failedSave of [false, true]) {
    const fixture = cloud(); const old = await fixture.storage.store({ buffer: pdf, mimeType: 'application/pdf' })
    const { profile, profileModel } = profileFixture(old); let warnings = 0
    const resumeStorage = { ...fixture.storage, remove: async () => { throw Error('Synthetic cleanup failure') } }
    if (failedSave) profile.save = async () => { throw Error('Original save failure') }
    const action = saveResume('student', file, { profileModel, resumeStorage, onCleanupFailure: () => { warnings++; throw Error('Reporter failed') } })
    if (failedSave) { await assert.rejects(action, /Original save failure/); assert.equal(profile.resume, old) }
    else { await action; assert.notEqual(profile.resume, old); assert.deepEqual(await fixture.storage.read(profile.resume), pdf) }
    assert.equal(warnings, 1)
    assert.deepEqual(await fixture.storage.read(old), pdf)
  }
})

test('invalid/missing/oversized/MIME/extension/signature inputs and failed profile lookup store nothing', async () => {
  const fixture = cloud(); const { profileModel } = profileFixture()
  for (const input of [undefined, { ...file, mimetype: 'text/plain' }, { ...file, originalname: 'resume.txt' }, { ...file, buffer: Buffer.from('not PDF') }, { ...file, buffer: Buffer.alloc(5242881) }]) {
    await assert.rejects(saveResume('student', input, { profileModel, resumeStorage: fixture.storage }), { errorCode: 'VALIDATION_ERROR' })
  }
  await assert.rejects(saveResume('student', file, { profileModel: { findOneAndUpdate: async () => { throw Error('Lookup failed') } }, resumeStorage: fixture.storage }), /Lookup failed/)
  assert.equal(fixture.files.size, 0)
})

test('production rejects legacy/local references without local reads or cloud calls; local rejects foreign paths/categories', async t => {
  const fixture = cloud()
  await assert.rejects(fixture.storage.read({ storagePath: '/private/legacy.pdf' }), { errorCode: 'STORAGE_UNAVAILABLE' })
  await assert.rejects(fixture.storage.remove({ storagePath: '/private/legacy.pdf' }), { errorCode: 'STORAGE_UNAVAILABLE' })
  await assert.rejects(fixture.storage.read({ storageReference: { provider: 'local', key: '2027/resume/12345678-1234-4123-8123-123456789abc.pdf' } }), { errorCode: 'VALIDATION_ERROR' })
  assert.deepEqual(fixture.events, [])
  const { directory, storage } = await local(t)
  const foreign = path.join(path.dirname(directory), `${path.basename(directory)}-foreign.pdf`)
  await writeFile(foreign, pdf); t.after(() => rm(foreign, { force: true }))
  await assert.rejects(storage.read({ storagePath: foreign }), { errorCode: 'VALIDATION_ERROR' })
  await assert.rejects(storage.remove({ storagePath: foreign }), { errorCode: 'VALIDATION_ERROR' })
  await assert.rejects(storage.read({ storageReference: { provider: 'local', key: '2027/class10/12345678-1234-4123-8123-123456789abc.pdf' } }), { errorCode: 'VALIDATION_ERROR' })
  assert.deepEqual(await readFile(foreign), pdf)
})

test('Mongoose resume schema accepts legacy, local and cloud resumes without changing academic schema requirements', async () => {
  const fixture = cloud(); const stored = await fixture.storage.store({ buffer: pdf, mimeType: 'application/pdf' })
  const base = { originalName: 'resume.pdf', mimeType: 'application/pdf', size: pdf.length, uploadedAt: new Date() }
  for (const metadata of [{ ...base, storagePath: '/legacy/resume.pdf' }, { ...base, ...stored }]) {
    const model = new StudentProfile({ userId: '507f1f77bcf86cd799439001', resume: metadata })
    await model.validate(); assert.deepEqual(publicResumeMetadata(model.resume), base)
  }
  const invalid = new StudentProfile({ userId: '507f1f77bcf86cd799439001', class10: { marksheet: { ...base, ...stored } } })
  await assert.rejects(invalid.validate(), /storagePath/)
})
