import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { DATABASE, APPLY_CONFIRMATION, COLLECTIONS, guardDatabase, fingerprint2027, inventory2027, migrate2027, mongoRepository, references } from '../scripts/lib/m11e-file-migration.js'
import { parseArguments } from '../scripts/m11e-files.js'
import { parseArguments as parseSanityArguments, SANITY_CONFIRMATION } from '../scripts/m11e-storage-sanity.js'
import { createStorage } from '../src/storage/storage.js'
import { STORAGE_CATEGORIES } from '../src/storage/storage-contract.js'

const pdf = Buffer.from('%PDF-1.7\nM11-E test only\n')
const png = Buffer.alloc(24); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png); png.write('IHDR', 12)
const filename = '00000000-0000-0000-0000-000000000001.png'
const cloudConfig = { NODE_ENV: 'production', MONGO_URI: 'mongodb://localhost/placementhub-v2-demo-2027', STORAGE_PROVIDER: 'supabase',
  SUPABASE_URL: 'https://synthetic-project.supabase.co', SUPABASE_STORAGE_BUCKET: 'placementhub-2027',
  SUPABASE_SECRET_KEY: ['sb', 'secret', 'synthetic_migration_test_only'].join('_') }

async function fixture(t, records) {
  const root = await mkdtemp(path.join(tmpdir(), 'placementhub-m11e-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const config = { RESUME_UPLOAD_DIR: path.join(root, 'pdf'), SOCIAL_UPLOAD_DIR: path.join(root, 'community-2027'), RESUME_MAX_FILE_SIZE_BYTES: 1024, SOCIAL_IMAGE_MAX_BYTES: 1024 }
  await mkdir(config.RESUME_UPLOAD_DIR); await mkdir(path.join(config.SOCIAL_UPLOAD_DIR, 'profile-avatars'), { recursive: true })
  const file = path.join(config.RESUME_UPLOAD_DIR, 'resume.pdf')
  await writeFile(file, pdf)
  const metadata = { originalName: 'resume.pdf', storagePath: file, mimeType: 'application/pdf', size: pdf.length, uploadedAt: new Date(0) }
  const data = records ?? { studentprofiles: [{ _id: 'student', resume: metadata }] }
  const events = []
  const repository = { databaseName: DATABASE,
    async *records(collection) { for (const record of data[collection] ?? []) yield record },
    async replaceIfUnchanged(item, next) {
      events.push('db')
      const record = data[item.collection].find(row => row._id === item.id)
      const keys = item.field.split('.'); let parent = record
      for (const key of keys.slice(0, -1)) parent = parent[key]
      const field = keys.at(-1)
      if (parent[field] !== item.metadata) return false
      parent[field] = next
      return true
    },
  }
  const objects = new Map()
  const cloud = { provider: 'supabase',
    async read(reference) { events.push('read'); if (!objects.has(reference.key)) throw Object.assign(Error('missing'), { errorCode: 'NOT_FOUND' }); return objects.get(reference.key) },
    async store(input) { events.push('upload'); objects.set(input.key, Buffer.from(input.buffer)); return { provider: 'supabase', key: input.key } },
    remove: () => assert.fail('Migration must never delete objects or local sources'),
  }
  return { config, repository, cloud, objects, events, data, file, metadata }
}

test('exact identity guard refuses 2026, URI overrides and accidental cloud dry-run/local apply', () => {
  assert.equal(guardDatabase('mongodb://127.0.0.1/placementhub-v2-demo-2027', { localOnly: true }), DATABASE)
  assert.equal(guardDatabase('mongodb+srv://synthetic.mongodb.net/placementhub-v2-demo-2027', { cloudOnly: true }), DATABASE)
  for (const uri of ['mongodb://localhost/placementhub-v2', 'mongodb://localhost/placementhub-v2-demo-2026', 'mongodb://localhost/placementhub-v2-demo-2027?dbName=2026', 'invalid']) assert.throws(() => guardDatabase(uri))
  assert.throws(() => guardDatabase('mongodb+srv://synthetic.mongodb.net/placementhub-v2-demo-2027', { localOnly: true }))
  assert.throws(() => guardDatabase('mongodb://localhost/placementhub-v2-demo-2027', { cloudOnly: true }))
  assert.deepEqual(parseArguments([]), { apply: false, envFile: '.env.cycle-2027' })
  assert.throws(() => parseArguments(['--apply']))
  assert.throws(() => parseArguments(['--apply', '--dry-run', `--confirm=${APPLY_CONFIRMATION}`]))
  assert.throws(() => parseArguments(['--reset']))
  assert.throws(() => parseArguments(['--env-file=.env.cycle-2026']))
  assert.deepEqual(parseSanityArguments(['--check-config']), { checkOnly: true })
  assert.deepEqual(parseSanityArguments([`--confirm=${SANITY_CONFIRMATION}`]), { checkOnly: false })
  assert.throws(() => parseSanityArguments([]))
  assert.throws(() => parseSanityArguments(['--check-config', `--confirm=${SANITY_CONFIRMATION}`]))
})

test('dry-run uses read-only records, no cloud access or mutation, deterministic keys and byte totals', async t => {
  const f = await fixture(t)
  f.repository.replaceIfUnchanged = () => assert.fail('Dry-run must not write')
  const before = JSON.stringify(f.data)
  const fingerprint = await fingerprint2027(f.repository)
  const one = await inventory2027(f.repository, f.config)
  const two = await inventory2027(f.repository, f.config)
  assert.deepEqual(one.items[0].reference, two.items[0].reference)
  assert.equal(one.report.localBytes, pdf.length)
  assert.equal(one.report.totalReferences, 1)
  assert.equal(one.report.categories.resume.local, 1)
  const report = await migrate2027(f.repository, f.config, { cloud: { provider: 'supabase', read: () => assert.fail('No cloud') } })
  assert.equal(report.mode, 'DRY_RUN'); assert.equal(JSON.stringify(f.data), before)
  assert.equal(await fingerprint2027(f.repository), fingerprint)
  assert.deepEqual(await readFile(f.file), pdf)
  assert.ok(!JSON.stringify(report).includes(f.file))
  await assert.rejects(migrate2027({ ...f.repository, databaseName: 'placementhub-v2' }, f.config))
  await assert.rejects(migrate2027(f.repository, f.config, { apply: true, cloud: f.cloud }))
  await assert.rejects(inventory2027(f.repository, { ...f.config, RESUME_UPLOAD_DIR: path.join(f.config.RESUME_UPLOAD_DIR, '2026') }))
})

test('missing, invalid, fixture and archived references are reported without migration', async t => {
  const f = await fixture(t)
  f.data.studentprofiles.push({ _id: 'missing', resume: { ...f.metadata, storagePath: path.join(f.config.RESUME_UPLOAD_DIR, 'missing.pdf') } },
    { _id: 'fixture', resume: { ...f.metadata, storagePath: 'fixture://historical/resume.pdf' } },
    { _id: 'archived', resume: { ...f.metadata, storagePath: path.join(f.config.RESUME_UPLOAD_DIR, '2026', 'resume.pdf') } },
    { _id: 'bad', resume: { ...f.metadata, storagePath: '../../outside.pdf' } })
  const { report } = await inventory2027(f.repository, f.config)
  assert.equal(report.categories.resume.missing, 1)
  assert.equal(report.categories.resume.excluded, 2)
  assert.equal(report.categories.resume.unsupported, 1)
  assert.deepEqual(new Set(report.issues.map(item => item.code)), new Set(['MISSING_LOCAL_FILE', 'EXCLUDED_FIXTURE_REFERENCE', 'EXCLUDED_ARCHIVED_REFERENCE', 'UNSUPPORTED_REFERENCE']))
})

test('already-cloud references are recognized locally without cloud calls or conversion', async t => {
  const f = await fixture(t)
  const { items } = await inventory2027(f.repository, f.config)
  f.data.studentprofiles[0].resume = { ...f.metadata, storageReference: items[0].reference }
  delete f.data.studentprofiles[0].resume.storagePath
  const report = await migrate2027(f.repository, f.config, { apply: true, confirmation: APPLY_CONFIRMATION, cloud: f.cloud })
  assert.equal(report.categories.resume.cloud, 1); assert.equal(report.cloudRecordedBytes, pdf.length)
  assert.equal(report.migrated, 0); assert.deepEqual(f.events, [])
})

test('verified upload precedes atomic reference update; sources remain; repeat is idempotent', async t => {
  const f = await fixture(t)
  const report = await migrate2027(f.repository, f.config, { apply: true, confirmation: APPLY_CONFIRMATION, cloud: f.cloud })
  assert.equal(report.migrated, 1)
  assert.deepEqual(f.events, ['read', 'upload', 'read', 'db'])
  assert.equal(f.data.studentprofiles[0].resume.storageReference.provider, 'supabase')
  assert.equal(f.data.studentprofiles[0].resume.storagePath, undefined)
  assert.deepEqual(await readFile(f.file), pdf)
  f.events.length = 0
  const again = await migrate2027(f.repository, f.config, { apply: true, confirmation: APPLY_CONFIRMATION, cloud: f.cloud })
  assert.equal(again.migrated, 0); assert.deepEqual(f.events, [])
})

test('upload/verification/DB failures preserve metadata; verified uploads are reused on retry', async t => {
  for (const failure of ['upload', 'verification', 'db']) {
    const f = await fixture(t)
    const cloud = { ...f.cloud }
    const save = f.repository.replaceIfUnchanged
    if (failure === 'upload') cloud.store = async () => { throw Error(cloudConfig.SUPABASE_SECRET_KEY) }
    if (failure === 'verification') cloud.read = async ref => f.objects.has(ref.key) ? Buffer.alloc(pdf.length) : f.cloud.read(ref)
    if (failure === 'db') f.repository.replaceIfUnchanged = async () => { throw Error(cloudConfig.SUPABASE_SECRET_KEY) }
    const report = await migrate2027(f.repository, f.config, { apply: true, confirmation: APPLY_CONFIRMATION, cloud })
    assert.equal(report.failed, 1); assert.equal(f.data.studentprofiles[0].resume, f.metadata)
    assert.ok(!JSON.stringify(report).includes(cloudConfig.SUPABASE_SECRET_KEY))
    assert.deepEqual(await readFile(f.file), pdf)
    if (failure === 'db') {
      f.repository.replaceIfUnchanged = save; f.events.length = 0
      const retry = await migrate2027(f.repository, f.config, { apply: true, confirmation: APPLY_CONFIRMATION, cloud: f.cloud })
      assert.equal(retry.migrated, 1); assert.equal(retry.reusedUploads, 1); assert.deepEqual(f.events, ['read', 'db'])
    }
  }
})

test('concurrent metadata replacement is never overwritten by migration', async t => {
  const f = await fixture(t)
  f.repository.replaceIfUnchanged = async () => false
  const report = await migrate2027(f.repository, f.config, { apply: true, confirmation: APPLY_CONFIRMATION, cloud: f.cloud })
  assert.equal(report.failed, 1); assert.equal(report.issues.at(-1).code, 'DATABASE_REFERENCE_CHANGED')
  assert.equal(f.data.studentprofiles[0].resume, f.metadata)
})

test('a conflicting deterministic cloud object is never overwritten or committed', async t => {
  const f = await fixture(t)
  const { items } = await inventory2027(f.repository, f.config)
  f.objects.set(items[0].reference.key, Buffer.alloc(pdf.length))
  const report = await migrate2027(f.repository, f.config, { apply: true, confirmation: APPLY_CONFIRMATION, cloud: f.cloud })
  assert.equal(report.failed, 1); assert.equal(report.issues.at(-1).code, 'VERIFICATION_FAILED')
  assert.deepEqual(f.events, ['read']); assert.equal(f.data.studentprofiles[0].resume, f.metadata)
})

test('current local provider references remain valid migration candidates', async t => {
  const f = await fixture(t)
  const key = '2027/resume/12345678-1234-4123-8123-123456789abc.pdf'
  await writeFile(path.join(f.config.RESUME_UPLOAD_DIR, key.split('/').at(-1)), pdf)
  f.data.studentprofiles[0].resume = { ...f.metadata, storageReference: { provider: 'local', key } }
  const report = await migrate2027(f.repository, f.config, { apply: true, confirmation: APPLY_CONFIRMATION, cloud: f.cloud })
  assert.equal(report.migrated, 1); assert.equal(report.categories.resume.local, 1)
  assert.equal(f.data.studentprofiles[0].resume.storageReference.provider, 'supabase')
  assert.deepEqual(await readFile(path.join(f.config.RESUME_UPLOAD_DIR, key.split('/').at(-1))), pdf)
})

test('every persistent category maps to its own prefix; articles, logos and deleted Feed excluded', async t => {
  const f = await fixture(t)
  await writeFile(path.join(f.config.SOCIAL_UPLOAD_DIR, filename), png)
  await writeFile(path.join(f.config.SOCIAL_UPLOAD_DIR, 'profile-avatars', filename), png)
  const image = { filename, mimeType: 'image/png', size: png.length }
  Object.assign(f.data, {
    studentprofiles: [{ _id: 's', resume: f.metadata, class10: { marksheet: f.metadata }, class12: { marksheet: f.metadata }, collegeResult: f.metadata }],
    companies: [{ _id: 'c', participationLetter: f.metadata, logoUrl: 'https://example.com/logo.png' }],
    placementdrives: [{ _id: 'd', documents: { companyRecruitmentInformation: f.metadata, placementDriveJobDescription: f.metadata, recruitmentProcessInstructions: f.metadata }, phaseExecution: [{ instructionPdf: f.metadata }] }],
    placementrecords: [{ _id: 'p', proof: [f.metadata] }], socialposts: [{ _id: 'post', contentType: 'feed', image }, { _id: 'article', contentType: 'article', image }, { _id: 'deleted', contentType: 'feed', deletedAt: new Date(), image }],
    socialprofiles: [{ _id: 'profile', role: 'student', avatar: image }],
  })
  const { report, items } = await inventory2027(f.repository, f.config)
  assert.equal(items.length, STORAGE_CATEGORIES.length)
  for (const category of STORAGE_CATEGORIES) { assert.equal(report.categories[category].local, 1); assert.equal(report.categories[category].prefix, `2027/${category}/`) }
  assert.deepEqual([...references('companies', { _id: 'logo', logoUrl: 'https://example.com/image.png' })], [])
})

test('orphan census distinguishes 2027 files from ambiguous shared files and excludes archives', async t => {
  const f = await fixture(t)
  await writeFile(path.join(f.config.RESUME_UPLOAD_DIR, 'ambiguous.pdf'), pdf)
  await writeFile(path.join(f.config.SOCIAL_UPLOAD_DIR, 'orphan.png'), png)
  await writeFile(path.join(f.config.SOCIAL_UPLOAD_DIR, 'm9-unreferenced.png'), png)
  await mkdir(path.join(f.config.RESUME_UPLOAD_DIR, '2026'))
  await writeFile(path.join(f.config.RESUME_UPLOAD_DIR, '2026', 'archived.pdf'), pdf)
  const { report } = await inventory2027(f.repository, f.config)
  assert.equal(report.filesystem.confirmed2027Orphans, 1)
  assert.equal(report.filesystem.unattributedSharedFiles, 1)
  assert.equal(report.filesystem.excludedFiles, 2)
})

test('raw Mongo repository projects file fields only and compares the original metadata before updating', async () => {
  const calls = []
  const repository = mongoRepository({ databaseName: DATABASE, collection: name => ({
    find: (query, options) => { calls.push([name, query, options]); return { sort: () => [] } },
    updateOne: async (filter, update) => { calls.push([filter, update]); return { matchedCount: 1 } },
  }) })
  repository.records('studentprofiles', COLLECTIONS.studentprofiles)
  const item = { collection: 'studentprofiles', id: 'id', field: 'resume', metadata: { size: 10 } }
  await repository.replaceIfUnchanged(item, { size: 11 })
  assert.deepEqual(calls[0][2].projection, { resume: 1, 'class10.marksheet': 1, 'class12.marksheet': 1, collegeResult: 1, updatedAt: 1 })
  assert.deepEqual(calls[1], [{ _id: 'id', resume: { size: 10 }, updatedAt: { $exists: false } }, { $set: { resume: { size: 11 } } }])
})

test('shared adapter supports deterministic private keys without accepting traversal or category mismatch', async () => {
  const objects = new Map()
  const storage = createStorage(cloudConfig, { client: { getBucket: async name => ({ data: { id: name, public: false } }), from: () => ({
    upload: async (key, bytes) => { objects.set(key, bytes); return {} },
    download: async key => ({ data: new Blob([objects.get(key)]) }),
  }) } })
  const key = '2027/resume/12345678-1234-4123-8123-123456789abc.pdf'
  const ref = await storage.store({ category: 'resume', buffer: pdf, mimeType: 'application/pdf', key })
  assert.equal(ref.key, key); assert.deepEqual(await storage.read(ref), pdf)
  for (const invalid of ['../outside.pdf', key.replace('/resume/', '/class10/'), key + '\n']) await assert.rejects(storage.store({ category: 'resume', buffer: pdf, mimeType: 'application/pdf', key: invalid }))
})

test('disposable adapter sanity test uses only its dedicated prefix, verifies bytes and removes its object', async () => {
  const events = []; const objects = new Map()
  const storage = createStorage(cloudConfig, { client: { getBucket: async name => { events.push('private'); return { data: { id: name, public: false } } }, from: () => ({
    upload: async (key, bytes) => { assert.match(key, /^2027\/m11-e-sanity\//); events.push('upload'); objects.set(key, bytes); return {} },
    download: async key => { events.push('read'); return { data: new Blob([objects.get(key)]) } },
    remove: async keys => { events.push('delete'); keys.forEach(key => objects.delete(key)); return {} },
  }) } })
  assert.equal((await storage.sanityCheck()).privateBucket, true)
  assert.equal(objects.size, 0); assert.deepEqual(events, ['private', 'upload', 'private', 'read', 'private', 'delete', 'private'])
})

test('disposable sanity cleanup runs on verification failure and public buckets are rejected', async () => {
  let removed = 0
  const storage = createStorage(cloudConfig, { client: { getBucket: async name => ({ data: { id: name, public: false } }), from: () => ({
    upload: async () => ({}), download: async () => ({ data: new Blob(['wrong content']) }), remove: async () => { removed++; return {} },
  }) } })
  await assert.rejects(storage.sanityCheck(), { errorCode: 'STORAGE_UNAVAILABLE' }); assert.equal(removed, 1)
  const publicStorage = createStorage(cloudConfig, { client: { getBucket: async name => ({ data: { id: name, public: true } }), from: () => assert.fail('Public bucket must never be used') } })
  await assert.rejects(publicStorage.sanityCheck(), { errorCode: 'STORAGE_UNAVAILABLE' })
})
