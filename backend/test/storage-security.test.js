import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { createStorage } from '../src/storage/storage.js'
import { AppError } from '../src/errors/app-error.js'

const config = {
  NODE_ENV: 'production', STORAGE_PROVIDER: 'supabase', SUPABASE_STORAGE_BUCKET: 'placementhub-2027',
  MONGO_URI: 'mongodb://localhost/placementhub-v2-demo-2027', SUPABASE_URL: 'https://synthetic-project.supabase.co',
  SUPABASE_SECRET_KEY: ['sb', 'secret', 'synthetic_security_fixture_only'].join('_'), STORAGE_TIMEOUT_MS: 1000,
}
const reference = { provider: 'supabase', key: '2027/resume/12345678-1234-4123-8123-123456789abc.pdf' }
const upload = { category: 'resume', buffer: Buffer.from('%PDF-1.7\ntest'), mimeType: 'application/pdf' }
const hanging = () => new Promise(() => {})
const privateBucket = async () => ({ data: { id: config.SUPABASE_STORAGE_BUCKET, public: false } })

test('malformed references and inherited MIME properties fail before cloud access', async () => {
  const storage = createStorage(config, { client: { getBucket: () => assert.fail('Storage must not be accessed') } })
  for (const key of [reference.key + '\n', reference.key + '\r\n', reference.key + '?download=1', reference.key + '\0',
    reference.key.replace('2027/', '2026/'), reference.key.replace('/resume/', '/unknown/'),
    reference.key.replace('/resume/', '/resume/../'), reference.key.replace('/resume/', '/resume%2f'),
    reference.key.replace('.pdf', '.png'), reference.key.replaceAll('/', '\\')]) {
    await assert.rejects(storage.read({ ...reference, key }), { errorCode: 'VALIDATION_ERROR' })
    await assert.rejects(storage.remove({ ...reference, key }), { errorCode: 'VALIDATION_ERROR' })
  }
  for (const mimeType of ['constructor', 'toString', '__proto__']) {
    await assert.rejects(storage.store({ ...upload, category: 'feed-image', mimeType }), { errorCode: 'VALIDATION_ERROR' })
  }
})

test('provider-thrown application errors cannot expose secrets or internal details', async () => {
  const marker = `${config.SUPABASE_SECRET_KEY} ${reference.key}`
  const leak = new AppError(marker, { statusCode: 422, errorCode: marker, details: { token: marker } })
  const storage = createStorage(config, { client: { getBucket: privateBucket, from: () => ({
    upload: async () => { throw leak }, download: async () => { throw leak }, remove: async () => { throw leak },
  }) } })
  for (const action of [() => storage.store(upload), () => storage.read(reference), () => storage.remove(reference)]) {
    await assert.rejects(action(), error => {
      assert.equal(error.errorCode, 'STORAGE_UNAVAILABLE')
      assert.equal(error.message, 'File storage is unavailable.')
      assert.ok(!JSON.stringify(error).includes(marker))
      assert.ok(!error.stack.includes(marker))
      return true
    })
  }
})

test('cloud deadlines bound bucket checks, upload/read/remove and blob conversion', async () => {
  const clients = [
    { getBucket: hanging },
    { getBucket: privateBucket, from: () => ({ upload: hanging }) },
    { getBucket: privateBucket, from: () => ({ download: hanging }) },
    { getBucket: privateBucket, from: () => ({ remove: hanging }) },
    { getBucket: privateBucket, from: () => ({ download: async () => ({ data: { size: 10, arrayBuffer: hanging } }) }) },
  ]
  await Promise.all(clients.map(async (client, index) => {
    const storage = createStorage(config, { client })
    const start = Date.now()
    await assert.rejects(index === 1 ? storage.store(upload) : index === 3 ? storage.remove(reference) : storage.read(reference), { errorCode: 'STORAGE_UNAVAILABLE' })
    assert.ok(Date.now() - start < 4000, 'Operation must finish within its deadline')
  }))
})

test('transport deadlines abort stalled requests and cancel stalled response bodies', async () => {
  let signal; let cancelled = false
  const stalledRequest = createStorage(config, { fetch: async (url, options) => { signal = options.signal; return hanging() } })
  await assert.rejects(stalledRequest.read(reference), { errorCode: 'STORAGE_UNAVAILABLE' })
  // The request timer may be scheduled just after the overall operation timer.
  await new Promise(resolve => setTimeout(resolve, 30))
  assert.equal(signal.aborted, true)
  const stalledBody = createStorage(config, { fetch: async () => new Response(new ReadableStream({ cancel() { cancelled = true } })) })
  await assert.rejects(stalledBody.read(reference), { errorCode: 'STORAGE_UNAVAILABLE' })
  await new Promise(resolve => setTimeout(resolve, 30))
  assert.equal(cancelled, true)
})

test('production startup rejects missing explicit provider/bucket and public credential variables safely', () => {
  for (const override of [{ STORAGE_PROVIDER: '' }, { SUPABASE_STORAGE_BUCKET: '' }, { VITE_ARBITRARY: config.SUPABASE_SECRET_KEY }]) {
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', "await import('./src/config/env.js')"], {
      cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 10000,
      env: { ...process.env, ...config, JWT_SECRET: 'synthetic-jwt-key-at-least-32-characters', AI_ENABLED: 'false', ...override },
    })
    assert.equal(child.status, 1)
    assert.ok(!child.stderr.includes(config.SUPABASE_SECRET_KEY))
    assert.match(child.stderr, /configuration|VITE/)
  }
})

test('backend installation enforces the compatible Node 24 runtime', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url)))
  const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url)))
  assert.equal(manifest.engines.node, '24.x')
  assert.deepEqual(lock.packages[''].engines, manifest.engines)
  assert.match(await readFile(new URL('../.npmrc', import.meta.url), 'utf8'), /engine-strict=true/)
})
