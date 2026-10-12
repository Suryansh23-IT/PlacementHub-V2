import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { storageConfigSchema, validatePublicEnvironment } from '../src/config/storage-config.js'
import { createStorage } from '../src/storage/storage.js'

const cloudConfig = Object.freeze({
  NODE_ENV: 'production', STORAGE_PROVIDER: 'supabase', SUPABASE_STORAGE_BUCKET: 'placementhub-2027', MONGO_URI: 'mongodb://localhost/placementhub-v2-demo-2027',
  SUPABASE_URL: 'https://synthetic-project.supabase.co',
  SUPABASE_SECRET_KEY: ['sb', 'secret', 'synthetic_storage_test_key_only'].join('_'),
})

test('development/test default to local without credentials, retaining existing paths and limits', () => {
  for (const NODE_ENV of ['development', 'test']) {
    const config = storageConfigSchema.parse({ NODE_ENV, SUPABASE_URL: '', SUPABASE_SECRET_KEY: '' })
    assert.equal(config.STORAGE_PROVIDER, 'local')
    assert.equal(config.RESUME_UPLOAD_DIR, 'uploads/resumes')
    assert.equal(config.SOCIAL_UPLOAD_DIR, 'uploads/community-2027')
    assert.equal(config.RESUME_MAX_FILE_SIZE_BYTES, 5242880)
    assert.equal(config.SOCIAL_IMAGE_MAX_BYTES, 5242880)
    assert.equal(createStorage(config).provider, 'local')
    assert.equal(storageConfigSchema.safeParse({ ...cloudConfig, NODE_ENV, STORAGE_PROVIDER: 'supabase' }).success, false)
  }
})

test('production selects Supabase lazily, never contacting cloud during construction', () => {
  const config = storageConfigSchema.parse(cloudConfig)
  assert.equal(config.STORAGE_PROVIDER, 'supabase')
  assert.equal(config.SUPABASE_STORAGE_BUCKET, 'placementhub-2027')
  assert.equal(createStorage(config, { fetch: () => assert.fail('Network forbidden') }).provider, 'supabase')
})

test('production refuses local fallback, incomplete credentials, wrong database/bucket and unsafe URL/key settings', () => {
  for (const override of [
    { STORAGE_PROVIDER: 'local' }, { STORAGE_PROVIDER: 'unknown' }, { STORAGE_PROVIDER: undefined },
    { SUPABASE_STORAGE_BUCKET: undefined },
    { SUPABASE_SECRET_KEY: cloudConfig.SUPABASE_SECRET_KEY + '\n' },
    { SUPABASE_URL: undefined }, { SUPABASE_SECRET_KEY: undefined },
    { MONGO_URI: 'mongodb://localhost/placementhub-v2' }, { MONGO_URI: undefined },
    { SUPABASE_STORAGE_BUCKET: 'other-bucket' }, { SUPABASE_SECRET_KEY: 'sb_publishable_synthetic' },
    { SUPABASE_URL: 'http://synthetic-project.supabase.co' }, { SUPABASE_URL: 'invalid' },
    { SUPABASE_URL: 'https://user:password@synthetic-project.supabase.co' },
    { SUPABASE_URL: 'https://synthetic-project.supabase.co/storage/v1' },
    { SUPABASE_URL: 'https://synthetic-project.supabase.co?key=secret' },
    { SUPABASE_URL: 'https://synthetic-project.supabase.co#secret' },
    { STORAGE_TIMEOUT_MS: 0 }, { RESUME_MAX_FILE_SIZE_BYTES: 10485761 },
  ]) {
    assert.equal(storageConfigSchema.safeParse({ ...cloudConfig, ...override }).success, false)
    assert.throws(() => createStorage({ ...cloudConfig, ...override }), { message: 'Invalid storage configuration.' })
  }
})

test('backend credentials cannot enter the public Vite environment namespace', () => {
  validatePublicEnvironment({ VITE_API_BASE_URL: '/api', SUPABASE_SECRET_KEY: cloudConfig.SUPABASE_SECRET_KEY })
  for (const environment of [
    { VITE_SUPABASE_SECRET_KEY: cloudConfig.SUPABASE_SECRET_KEY },
    { VITE_MONGO_URI: cloudConfig.MONGO_URI },
    { VITE_ARBITRARY: cloudConfig.SUPABASE_SECRET_KEY },
    { VITE_ARBITRARY: cloudConfig.MONGO_URI },
    { VITE_JWT_SECRET: 'synthetic-marker' },
    { JWT_SECRET: 'synthetic-marker', VITE_ARBITRARY: 'synthetic-marker' },
  ]) {
    assert.throws(() => validatePublicEnvironment(environment), { message: 'Backend credentials are forbidden in VITE_* environment variables.' })
  }
})

test('actual env startup rejects missing production storage settings without printing secrets', () => {
  const syntheticSecret = 'private-synthetic-marker'
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', "await import('./src/config/env.js')"], {
    cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 10000,
    env: { ...process.env, NODE_ENV: 'production', MONGO_URI: cloudConfig.MONGO_URI,
      JWT_SECRET: 'synthetic-jwt-secret-with-at-least-32-characters', AI_ENABLED: 'false',
      STORAGE_PROVIDER: 'supabase', SUPABASE_URL: '', SUPABASE_SECRET_KEY: syntheticSecret },
  })
  assert.equal(child.status, 1)
  assert.match(child.stderr, /SUPABASE/)
  assert.ok(!child.stderr.includes(syntheticSecret))
})
