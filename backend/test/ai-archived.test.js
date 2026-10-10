import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

test('archived and unknown apps do not register AI routes or import provider/cache; health remains usable', () => {
  for (const database of ['placementhub-v2', 'unknown-runtime']) {
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      import { registerHooks } from 'node:module';
      registerHooks({ resolve(specifier, context, nextResolve) {
        if (/ai\\.(routes|service|cache)|(?:gemini|ollama|ai)\\.provider/.test(specifier)) throw new Error('ARCHIVED AI IMPORT');
        return nextResolve(specifier, context);
      }});
      const { app } = await import('./src/app.js');
      const server = app.listen(0);
      try {
        const base = 'http://127.0.0.1:' + server.address().port + '/api/v1';
        for (const path of ['/ai/status', '/ai/analyze', '/ai/students/me/career', '/ai/students/me/drives/000000000000000000000001/match', '/ai/companies/limits', '/ai/companies/drives/000000000000000000000001/candidates/000000000000000000000002']) assert.equal((await fetch(base + path)).status, 404);
        for (const path of ['/ai/students/me/career/explanation', '/ai/students/me/drives/000000000000000000000001/match/explanation', '/ai/students/me/career/ask', '/ai/students/me/drives/000000000000000000000001/match/ask', '/ai/companies/overview', '/ai/companies/drives/000000000000000000000001/batches', '/ai/companies/drives/000000000000000000000001/group/ask']) assert.equal((await fetch(base + path, { method: 'POST' })).status, 404);
        assert.equal((await fetch(base + '/health')).status, 200);
      } finally { await new Promise(resolve => server.close(resolve)); }
    `], { cwd: new URL('..', import.meta.url), env: { ...process.env, MONGO_URI: `mongodb://localhost/${database}`, JWT_SECRET: 'synthetic-secret-that-is-long-enough-for-tests', AI_ENABLED: 'true', GEMINI_API_KEY: '', GEMINI_MODEL: '' }, encoding: 'utf8', timeout: 15000 })
    assert.equal(child.status, 0, child.stderr)
  }
})
