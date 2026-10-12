import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { mkdtemp, mkdir, readdir, writeFile, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createStorage } from '../src/storage/storage.js'
import { STORAGE_CATEGORIES } from '../src/storage/storage-contract.js'

const cloud = { NODE_ENV: 'production', STORAGE_PROVIDER: 'supabase', SUPABASE_STORAGE_BUCKET: 'placementhub-2027', MONGO_URI: 'mongodb://localhost/placementhub-v2-demo-2027', SUPABASE_URL: 'https://synthetic-project.supabase.co', SUPABASE_SECRET_KEY: ['sb', 'secret', 'synthetic_storage_test_key_only'].join('_') }
const pdf = Buffer.from('%PDF-1.7\nsynthetic test document')
const upload = { category: 'resume', buffer: pdf, mimeType: 'application/pdf' }
const reference = { provider: 'supabase', key: '2027/resume/12345678-1234-4123-8123-123456789abc.pdf' }

async function localFixture(t, limits = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'placementhub-e1-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const pdfRoot = path.join(directory, 'resumes'); const imageRoot = path.join(directory, 'community')
  return { directory, pdfRoot, imageRoot, storage: createStorage({ NODE_ENV: 'test', RESUME_UPLOAD_DIR: pdfRoot, SOCIAL_UPLOAD_DIR: imageRoot, ...limits }) }
}

function cloudFixture(overrides = {}) {
  const calls = []; const files = new Map()
  const client = {
    async getBucket(name) { calls.push(['bucket', name]); return { data: { id: name, public: false } } },
    from(name) {
      calls.push(['from', name])
      return {
        async upload(key, bytes, options) { calls.push(['upload', key, options]); files.set(key, Buffer.from(bytes)); return { data: { path: key }, error: null } },
        async download(key) { calls.push(['download', key]); return files.has(key) ? { data: new Blob([files.get(key)]) } : { error: { statusCode: '404' } } },
        async remove(keys) { calls.push(['remove', keys]); keys.forEach(key => files.delete(key)); return { error: null } },
      }
    },
    ...overrides,
  }
  return { calls, files, client, storage: createStorage(cloud, { client }) }
}

test('local construction writes nothing; all categories use existing directories and round-trip bytes', async t => {
  const { directory, pdfRoot, imageRoot, storage } = await localFixture(t)
  assert.deepEqual(await readdir(directory), [])
  for (const category of STORAGE_CATEGORIES) {
    const image = ['feed-image', 'profile-avatar'].includes(category)
    const ref = await storage.store({ category, buffer: pdf, mimeType: image ? 'image/png' : 'application/pdf' })
    const root = category === 'profile-avatar' ? path.join(imageRoot, 'profile-avatars') : image ? imageRoot : pdfRoot
    const filename = ref.key.split('/').at(-1)
    assert.deepEqual(await readFile(path.join(root, filename)), pdf)
    assert.deepEqual(await storage.read(ref), pdf)
    await storage.remove(ref); await storage.remove(ref)
    await assert.rejects(storage.read(ref), { statusCode: 404, errorCode: 'NOT_FOUND' })
  }
})

test('local rejects traversal, foreign providers, malformed references and invalid upload sizes/types before writing', async t => {
  const { storage, directory } = await localFixture(t, { RESUME_MAX_FILE_SIZE_BYTES: 32 })
  for (const input of [{ ...upload, buffer: Buffer.alloc(33) }, { ...upload, buffer: Buffer.alloc(0) }, { ...upload, mimeType: 'text/plain' }, { ...upload, category: '../outside' }]) {
    await assert.rejects(storage.store(input), { errorCode: 'VALIDATION_ERROR' })
  }
  for (const ref of [reference, { provider: 'local', key: '../secret.pdf' }, { provider: 'local', key: 'C:\\private.pdf' }, { provider: 'local', key: reference.key.replace('.pdf', '.png') }, { provider: 'local', key: reference.key.replace('/resume/', '/unknown/') }]) {
    await assert.rejects(storage.read(ref), { errorCode: 'VALIDATION_ERROR' })
    await assert.rejects(storage.remove(ref), { errorCode: 'VALIDATION_ERROR' })
  }
  assert.deepEqual(await readdir(directory), [])
})

test('local bounded reads reject externally enlarged files without deleting them', async t => {
  const { storage, pdfRoot } = await localFixture(t, { RESUME_MAX_FILE_SIZE_BYTES: 32 })
  const ref = await storage.store(upload)
  const filename = path.join(pdfRoot, ref.key.split('/').at(-1))
  await writeFile(filename, Buffer.alloc(33))
  await assert.rejects(storage.read(ref), { errorCode: 'VALIDATION_ERROR' })
  assert.equal((await readFile(filename)).length, 33)
})

test('local accepts exact configured byte limits and sanitizes filesystem failures', async t => {
  const { directory, storage } = await localFixture(t, { RESUME_MAX_FILE_SIZE_BYTES: 32, SOCIAL_IMAGE_MAX_BYTES: 32 })
  for (const input of [{ ...upload, buffer: Buffer.alloc(32) }, { category: 'feed-image', mimeType: 'image/png', buffer: Buffer.alloc(32) }]) {
    const ref = await storage.store(input)
    assert.equal((await storage.read(ref)).length, 32)
  }
  const invalidRoot = path.join(directory, 'not-a-directory')
  await writeFile(invalidRoot, pdf)
  const failing = createStorage({ NODE_ENV: 'test', RESUME_UPLOAD_DIR: invalidRoot })
  await assert.rejects(failing.store(upload), error => {
    assert.equal(error.errorCode, 'STORAGE_UNAVAILABLE')
    assert.ok(!error.stack.includes(invalidRoot))
    return true
  })
})

test('local refuses symlinks for reads and deletes, retaining the external target', async t => {
  const { storage, directory, pdfRoot } = await localFixture(t)
  await mkdir(pdfRoot)
  const outside = path.join(directory, 'outside.pdf'); await writeFile(outside, pdf)
  const ref = { ...reference, provider: 'local' }
  try { await symlink(outside, path.join(pdfRoot, ref.key.split('/').at(-1))) }
  catch (error) { if (error.code === 'EPERM') { t.skip('Windows requires symlink permission.'); return } throw error }
  await assert.rejects(storage.read(ref), { errorCode: 'VALIDATION_ERROR' })
  await assert.rejects(storage.remove(ref), { errorCode: 'VALIDATION_ERROR' })
  assert.deepEqual(await readFile(outside), pdf)
})

test('private Supabase adapter round-trips exact keys, never overwrites, and removes only one object', async () => {
  const { storage, calls } = cloudFixture()
  assert.deepEqual(calls, [])
  const ref = await storage.store(upload)
  assert.deepEqual(Object.keys(ref).sort(), ['key', 'provider'])
  assert.match(ref.key, /^2027\/resume\/[a-f\d-]+\.pdf$/)
  assert.deepEqual(await storage.read(ref), pdf)
  await storage.remove(ref); await storage.remove(ref)
  await assert.rejects(storage.read(ref), { errorCode: 'NOT_FOUND' })
  assert.deepEqual(calls.find(call => call[0] === 'upload')[2], { contentType: 'application/pdf', upsert: false })
  assert.deepEqual(calls.find(call => call[0] === 'remove')[1], [ref.key])
  assert.ok(calls.filter(call => ['bucket', 'from'].includes(call[0])).every(call => call[1] === 'placementhub-2027'))
})

test('Supabase refuses public/missing/mismatched buckets for every operation, without file calls', async () => {
  for (const response of [{ data: { id: 'placementhub-2027', public: true } }, { data: { id: 'other', public: false } }, { data: {} }, { error: { message: cloud.SUPABASE_SECRET_KEY } }]) {
    const { storage, calls } = cloudFixture({ getBucket: async () => response })
    await assert.rejects(storage.store(upload), { errorCode: 'STORAGE_UNAVAILABLE' })
    await assert.rejects(storage.read(reference), { errorCode: 'STORAGE_UNAVAILABLE' })
    await assert.rejects(storage.remove(reference), { errorCode: 'STORAGE_UNAVAILABLE' })
    assert.deepEqual(calls, [])
  }
})

test('Supabase rechecks bucket privacy after successful operations', async () => {
  const fixture = cloudFixture()
  const ref = await fixture.storage.store(upload)
  fixture.client.getBucket = async () => ({ data: { id: 'placementhub-2027', public: true } })
  await assert.rejects(fixture.storage.read(ref), { errorCode: 'STORAGE_UNAVAILABLE' })
  await assert.rejects(fixture.storage.remove(ref), { errorCode: 'STORAGE_UNAVAILABLE' })
  assert.equal(fixture.files.size, 1)
})

test('Supabase validates references/size/MIME before SDK calls and bounds returned bytes', async () => {
  const { storage, calls, files } = cloudFixture()
  await assert.rejects(storage.read({ ...reference, key: '../secret' }), { errorCode: 'VALIDATION_ERROR' })
  await assert.rejects(storage.remove({ ...reference, provider: 'local' }), { errorCode: 'VALIDATION_ERROR' })
  await assert.rejects(storage.store({ ...upload, mimeType: 'image/png' }), { errorCode: 'VALIDATION_ERROR' })
  await assert.rejects(storage.store({ ...upload, buffer: Buffer.alloc(5242881) }), { errorCode: 'VALIDATION_ERROR' })
  assert.deepEqual(calls, [])
  files.set(reference.key, Buffer.alloc(5242881))
  await assert.rejects(storage.read(reference), { errorCode: 'VALIDATION_ERROR' })
})

test('cloud errors are sanitized without credentials, internal references or raw provider errors', async () => {
  const marker = `${cloud.SUPABASE_SECRET_KEY} ${cloud.SUPABASE_URL} ${reference.key}`
  for (const method of ['upload', 'download', 'remove']) {
    for (const thrown of [true, false]) {
      const { storage } = cloudFixture({ from: () => ({ [method]: async () => { if (thrown) throw Error(marker); return { error: { message: marker, statusCode: 500 } } } }) })
      const action = method === 'upload' ? storage.store(upload) : method === 'download' ? storage.read(reference) : storage.remove(reference)
      await assert.rejects(action, error => {
        assert.equal(error.errorCode, 'STORAGE_UNAVAILABLE')
        assert.ok(!JSON.stringify(error).includes('sb_secret_'))
        assert.ok(!error.stack.includes(marker))
        return true
      })
    }
  }
})

test('real Storage SDK uses only private endpoints, apikey authentication and bounded fetch with stubbed transport', async () => {
  const requests = []
  const storage = createStorage(cloud, { fetch: async (url, options) => {
    requests.push({ url: String(url), options })
    if (String(url).includes('/bucket/')) return Response.json({ id: 'placementhub-2027', public: false })
    if (options.method === 'POST' && String(url).includes('/object/')) return Response.json({ Key: reference.key })
    if (options.method === 'DELETE') return Response.json([])
    return new Response(pdf, { headers: { 'Content-Type': 'application/pdf' } })
  } })
  const ref = await storage.store(upload)
  assert.deepEqual(await storage.read(ref), pdf)
  await storage.remove(ref)
  assert.equal(requests.length, 6)
  for (const { url, options } of requests) {
    const headers = new Headers(options.headers)
    assert.equal(headers.get('apikey'), cloud.SUPABASE_SECRET_KEY)
    assert.equal(headers.get('Authorization'), null)
    assert.equal(options.redirect, 'error')
    assert.equal(options.cache, 'no-store')
    assert.ok(options.signal instanceof AbortSignal)
    assert.ok(!/\/public\/|\/sign\/|\/auth\/|\/rest\//.test(url))
  }
})

test('stubbed SDK transport errors and oversized HTTP bodies fail safely without cloud fallback', async () => {
  for (const fetch of [async () => { throw Error(cloud.SUPABASE_SECRET_KEY) }, async () => new Response(Buffer.alloc(5242881))]) {
    const storage = createStorage(cloud, { fetch })
    await assert.rejects(storage.read(reference), { errorCode: 'STORAGE_UNAVAILABLE' })
  }
})
