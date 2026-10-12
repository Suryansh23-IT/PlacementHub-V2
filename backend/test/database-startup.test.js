import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { withDatabaseStartupDeadline, DatabaseStartupError } from '../src/config/database-startup.js'

test('production deadline bounds unresolved DNS/connection work', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const pending = withDatabaseStartupDeadline(() => new Promise(() => {}))
  const rejected = assert.rejects(pending, error => {
    assert.ok(error instanceof DatabaseStartupError)
    assert.equal(error.category, 'STARTUP_TIMEOUT')
    return true
  })
  t.mock.timers.tick(15000)
  await rejected
})

test('connection succeeds and cancels its startup deadline', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let calls = 0
  await withDatabaseStartupDeadline(async () => { calls++ })
  t.mock.timers.tick(15000)
  assert.equal(calls, 1)
})

test('provider failures become sanitized diagnostic categories', async () => {
  const cases = [
    [{ code: 'ENOTFOUND' }, 'DNS_FAILURE'],
    [{ code: 'ETIMEOUT', syscall: 'querySrv' }, 'DNS_FAILURE'],
    [{ code: 18 }, 'AUTHENTICATION_FAILURE'],
    [{ code: 'CERT_HAS_EXPIRED' }, 'TLS_FAILURE'],
    [{ name: 'MongoParseError' }, 'CONNECTION_CONFIGURATION_FAILURE'],
    [{ name: 'MongoServerSelectionError' }, 'SERVER_SELECTION_FAILURE'],
    [{ code: 'ETIMEDOUT' }, 'CONNECT_TIMEOUT'],
    [{ code: 'ECONNREFUSED' }, 'NETWORK_FAILURE'],
    [{ name: 'UnknownProviderError' }, 'DATABASE_CONNECTION_FAILURE'],
    [{ name: 'MongooseServerSelectionError', reason: {
      servers: new Map([['synthetic-host', { error: { cause: { code: 'ENOTFOUND' } } }]]),
    } }, 'DNS_FAILURE'],
  ]
  for (const [properties, category] of cases) {
    const failure = Object.assign(new Error('sensitive-provider-detail'), properties)
    await assert.rejects(withDatabaseStartupDeadline(() => Promise.reject(failure)), error => {
      assert.equal(error.category, category)
      assert.equal(error.message, 'Production database connection failed.')
      assert.equal(error.cause, undefined)
      assert.ok(!JSON.stringify(error).includes('sensitive-provider-detail'))
      return true
    })
  }
})

function child(mode, code) {
  return spawnSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict'
    import mongoose from 'mongoose'
    ${code}
  `], {
    cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 10000,
    env: {
      ...process.env, NODE_ENV: mode,
      DOTENV_CONFIG_PATH: 'test/__absent_database_test_environment__.env',
      MONGO_URI: 'mongodb://127.0.0.1/placementhub-v2-demo-2027',
      JWT_SECRET: 'synthetic-database-startup-test-signing-secret', AI_ENABLED: 'false',
      STORAGE_PROVIDER: mode === 'production' ? 'supabase' : 'local',
      SUPABASE_URL: 'https://synthetic-project.supabase.co',
      SUPABASE_STORAGE_BUCKET: 'placementhub-2027',
      SUPABASE_SECRET_KEY: ['sb', 'secret', 'synthetic_database_test_only'].join('_'),
    },
  })
}

test('production connection passes the unchanged URI with bounded driver options and safe logs', () => {
  const result = child('production', `
    let calls = 0
    mongoose.connect = async (uri, options) => {
      calls++
      assert.equal(uri, process.env.MONGO_URI)
      assert.deepEqual(options, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000 })
    }
    const { connectDatabase } = await import('./src/config/database.js')
    await connectDatabase()
    assert.equal(calls, 1)
  `)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /connection attempt started/)
  assert.match(result.stdout, /MongoDB connected \(production\)/)
  assert.ok(!result.stdout.includes('mongodb://'))
})

test('local connection retains existing options and successful host logging', () => {
  const result = child('development', `
    mongoose.connection.host = 'synthetic-local-host'
    mongoose.connect = async (uri, options) => {
      assert.equal(uri, process.env.MONGO_URI)
      assert.deepEqual(options, { serverSelectionTimeoutMS: 5000 })
    }
    const { connectDatabase } = await import('./src/config/database.js')
    await connectDatabase()
  `)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /MongoDB connected: synthetic-local-host/)
  assert.ok(!result.stdout.includes('deadline'))
})

test('production server exits on DNS failure with safe category before listening', () => {
  const result = child('production', `
    mongoose.connect = async () => {
      throw Object.assign(new Error('sensitive-provider-detail'), { code: 'ENOTFOUND' })
    }
    await import('./src/server.js')
  `)
  assert.equal(result.status, 1, result.stderr)
  assert.match(result.stdout, /connection attempt started/)
  assert.match(result.stderr, /DNS_FAILURE/)
  assert.ok(!result.stderr.includes('sensitive-provider-detail'))
  assert.ok(!result.stdout.includes('API listening'))
})

test('production server exits even when driver connection never settles', () => {
  const result = child('production', `
    const originalTimeout = globalThis.setTimeout
    globalThis.setTimeout = (fn, delay, ...args) => originalTimeout(fn, delay === 15000 ? 20 : delay, ...args)
    mongoose.connect = () => new Promise(() => {})
    await import('./src/server.js')
  `)
  assert.equal(result.status, 1, result.stderr)
  assert.match(result.stdout, /deadline 15000ms/)
  assert.match(result.stderr, /STARTUP_TIMEOUT/)
  assert.ok(!result.stdout.includes('API listening'))
})
