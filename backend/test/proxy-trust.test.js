import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

function check(mode, code) {
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict'
    import express from 'express'
    import { once } from 'node:events'
    const { app } = await import('./src/app.js')
    ${code}
  `], {
    cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 20000,
    env: {
      ...process.env, NODE_ENV: mode,
      DOTENV_CONFIG_PATH: 'test/__absent_proxy_test_environment__.env',
      MONGO_URI: 'mongodb://127.0.0.1/placementhub-v2-demo-2027',
      JWT_SECRET: 'synthetic-proxy-test-signing-secret-long-enough',
      AI_ENABLED: 'false', AUTH_RATE_LIMIT_MAX: '3', AUTH_RATE_LIMIT_WINDOW_MS: '60000',
      STORAGE_PROVIDER: mode === 'production' ? 'supabase' : 'local',
      SUPABASE_URL: 'https://synthetic-project.supabase.co',
      SUPABASE_STORAGE_BUCKET: 'placementhub-2027',
      SUPABASE_SECRET_KEY: ['sb', 'secret', 'synthetic_proxy_test_only'].join('_'),
    },
  })
  assert.equal(child.status, 0, child.stderr || child.error?.message)
}

test('production trusts one proxy hop and ignores extra forwarded addresses', () => {
  check('production', `
    assert.equal(app.get('trust proxy'), 1)
    const trust = app.get('trust proxy fn')
    assert.equal(trust('10.0.0.10', 0), true)
    assert.equal(trust('198.51.100.20', 1), false)
    function request(forwarded) {
      const req = Object.create(express.request)
      req.app = app
      req.socket = { remoteAddress: '10.0.0.10' }
      req.headers = forwarded ? { 'x-forwarded-for': forwarded } : {}
      return req
    }
    assert.equal(request('198.51.100.20').ip, '198.51.100.20')
    assert.equal(request('203.0.113.99, 198.51.100.20').ip, '198.51.100.20')
    assert.deepEqual(request('203.0.113.99, 198.51.100.20').ips, ['198.51.100.20'])
    assert.equal(request().ip, '10.0.0.10')
  `)
})

for (const mode of ['development', 'test']) {
  test(`${mode} retains direct socket IP and ignores forwarded claims`, () => {
    check(mode, `
      assert.equal(app.get('trust proxy'), false)
      const req = Object.create(express.request)
      req.app = app
      req.socket = { remoteAddress: '127.0.0.1' }
      req.headers = { 'x-forwarded-for': '203.0.113.99, 198.51.100.20' }
      assert.equal(req.ip, '127.0.0.1')
      assert.deepEqual(req.ips, [])
    `)
  })
}

test('production auth limiter separates proxy clients and shares login/register limits', () => {
  check('production', `
    const server = app.listen(0, '127.0.0.1')
    await once(server, 'listening')
    try {
      const base = 'http://127.0.0.1:' + server.address().port + '/api/v1/auth'
      const send = async (forwarded, route = 'login') => {
        const response = await fetch(base + '/' + route, {
          method: 'POST', body: '{}',
          headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': forwarded },
        })
        return { status: response.status, body: await response.json() }
      }
      for (const spoof of ['203.0.113.1', '203.0.113.2', '203.0.113.3']) {
        assert.equal((await send(spoof + ', 198.51.100.20')).status, 422)
      }
      const blocked = await send('203.0.113.4, 198.51.100.20', 'register')
      assert.equal(blocked.status, 429)
      assert.equal(blocked.body.errorCode, 'RATE_LIMITED')
      assert.equal((await send('198.51.100.21')).status, 422)
    } finally {
      await new Promise(resolve => server.close(resolve))
    }
  `)
})

test('local direct authentication retains its existing rate limit', () => {
  check('development', `
    const server = app.listen(0, '127.0.0.1')
    await once(server, 'listening')
    try {
      const base = 'http://127.0.0.1:' + server.address().port + '/api/v1/auth'
      const send = async route => {
        const response = await fetch(base + '/' + route, {
          method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' },
        })
        await response.arrayBuffer()
        return response.status
      }
      for (let i = 0; i < 3; i++) assert.equal(await send('login'), 422)
      assert.equal(await send('register'), 429)
    } finally {
      await new Promise(resolve => server.close(resolve))
    }
  `)
})
