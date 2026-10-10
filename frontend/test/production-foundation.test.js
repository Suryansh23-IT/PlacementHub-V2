import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import React, { act } from 'react'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'
import { createFrontendRuntime } from '../src/features/placement-cycle/runtime-config.js'
import { createPlacementCycleConfig } from '../src/features/placement-cycle/placement-cycle-core.js'

test('public runtime excludes archive while local runtime keeps both cycles and AI', () => {
  const publicRuntime = createFrontendRuntime({ VITE_API_URL_2027: 'https://api.example.com/api/v1', VITE_API_URL_2026: 'http://localhost:5000/api/v1' }, true)
  const config = createPlacementCycleConfig(publicRuntime)
  assert.equal(publicRuntime.aiEnabled, false)
  assert.deepEqual(Object.keys(config.cycles), ['2027'])
  assert.equal(config.normalize('2026'), '2027')
  assert.equal(config.sessionKey('2026'), 'placementhub_auth_2027')
  assert.equal(config.cycles[config.normalize('2026')].apiUrl, 'https://api.example.com/api/v1')
  for (const url of ['http://localhost:5001/api/v1', 'https://127.0.0.1/api/v1', '//foreign.example/api', 'https://user:pass@api.example.com']) assert.throws(() => createFrontendRuntime({ VITE_API_URL_2027: url }, true))
  assert.throws(() => createFrontendRuntime({ VITE_AI_ENABLED: 'true' }, true))
  assert.throws(() => createFrontendRuntime({ VITE_APP_MODE: 'unknown' }))
  const local = createFrontendRuntime({}, false)
  assert.equal(local.aiEnabled, true)
  assert.equal(createPlacementCycleConfig(local).normalize('2026'), '2026')
  assert.equal(createFrontendRuntime({ VITE_AI_ENABLED: 'false' }).archiveEnabled, true)
})

const server = await createServer({ configFile: false, plugins: [(await import('@vitejs/plugin-react')).default()], define: { 'import.meta.env.VITE_APP_MODE': JSON.stringify('public'), 'import.meta.env.VITE_AI_ENABLED': JSON.stringify('false'), 'import.meta.env.VITE_API_URL_2027': JSON.stringify('/api/v1') }, server: { middlewareMode: true, hmr: false }, appType: 'custom', cacheDir: 'node_modules/.vite-production-test' })
const { StudentIntelligence } = await server.ssrLoadModule('/src/features/ai/StudentIntelligence.jsx')
const { CompanyCandidateIntelligence, CompanyExplorerTools } = await server.ssrLoadModule('/src/features/ai/CompanyIntelligence.jsx')
const { AdminPlacementIntelligence } = await server.ssrLoadModule('/src/features/ai/AdminIntelligence.jsx')
const { useCompanyExplorerAi } = await server.ssrLoadModule('/src/features/ai/useCompanyExplorerAi.js')
const { PlacementCycleContext } = await server.ssrLoadModule('/src/features/placement-cycle/PlacementCycleContext.jsx')
const cycleApi = await server.ssrLoadModule('/src/features/placement-cycle/placement-cycle.js')
const { CompanyCandidateExplorerPage } = await server.ssrLoadModule('/src/pages/CompanyCandidateExplorerPage.jsx')
const { AuthContext } = await server.ssrLoadModule('/src/features/auth/auth.context.js')
const { PlacementCycleSelector } = await server.ssrLoadModule('/src/components/placement-cycle/PlacementCycleSelector.jsx')
const { MemoryRouter } = await import('react-router-dom')
const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost:5173' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true })
const { createRoot } = await import('react-dom/client')
const h = React.createElement
const cycle = { activeCycle: '2027', cycle: { id: '2027' }, cycles: Object.values(cycleApi.PLACEMENT_CYCLES), setActiveCycle: () => {} }
async function mount(content, value = cycle) {
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container)
  await act(async () => { root.render(h(PlacementCycleContext.Provider, { value }, content)); await new Promise(resolve => setTimeout(resolve, 20)) })
  return { container, close: async () => { await act(async () => root.unmount()); container.remove() } }
}
test('stored 2026 selection uses 2027 API/auth and selector exposes only current cycle', async () => {
  localStorage.setItem('placementhub_active_cycle', '2026')
  localStorage.setItem('placementhub_auth_2026', '{"accessToken":"archived-token"}')
  assert.equal(cycleApi.readStoredPlacementCycle(), '2027')
  assert.equal(cycleApi.activePlacementCycle(), '2027')
  assert.equal(cycleApi.apiUrlForPlacementCycle('2026'), '/api/v1')
  assert.equal(cycleApi.sessionStorageKeyForCycle('2026'), 'placementhub_auth_2027')
  assert.equal(localStorage.getItem(cycleApi.sessionStorageKeyForCycle(cycleApi.activePlacementCycle())), null)
  assert.equal(cycleApi.persistPlacementCycle('2026'), '2027')
  assert.equal(localStorage.getItem('placementhub_auth_2026'), '{"accessToken":"archived-token"}')
  const view = await mount(h(PlacementCycleSelector))
  assert.equal(view.container.querySelectorAll('button').length, 1)
  assert(!view.container.textContent.includes('2026')); await view.close()
})
test('all four public AI areas show Coming Soon, keep objective scores, and never call semantic APIs', async () => {
  let reads = 0; let semanticCalls = 0
  const forbidden = async () => { semanticCalls++; throw Error('Disabled semantic request') }
  const data = { deterministic: { score: 82, label: 'Strong', improvementAreas: [], breakdown: [] }, assessment: null, ai: { status: 'unavailable', reason: 'disabled' } }
  const load = async () => { reads++; return { data } }
  const provider = new Proxy({ getCompanyCandidateAi: load }, { get: (target, key) => target[key] ?? forbidden })
  function Explorer() { const intelligence = useCompanyExplorerAi('token', [{ driveId: 'drive', studentId: 'student' }], provider); return h(CompanyExplorerTools, { intelligence, token: 'token', rows: [] }) }
  const content = h(React.Fragment, null,
    h(StudentIntelligence, { token: 'token', load, ask: forbidden, assess: forbidden }),
    h(StudentIntelligence, { token: 'token', driveId: 'drive', load, ask: forbidden, assess: forbidden }),
    h(CompanyCandidateIntelligence, { token: 'token', provider }),
    h(AdminPlacementIntelligence, { token: 'token', provider }), h(Explorer))
  const view = await mount(content)
  assert.equal(reads, 3); assert.equal(semanticCalls, 0)
  assert.equal(view.container.querySelectorAll('button,input,select').length, 0)
  assert.equal([...view.container.querySelectorAll('h2')].filter(row => row.textContent === 'AI Intelligence — Coming Soon').length, 5)
  for (const area of ['Student Career AI', 'Student Drive AI', 'Company Candidate AI', 'Admin Placement AI']) assert.match(view.container.textContent, new RegExp(area))
  assert.match(view.container.textContent, /Student Profile Score: 82\/100/)
  assert.match(view.container.textContent, /Objective Match: 82%/)
  assert(!/Generate|Ollama|Reset AI Runtime|Not analyzed/.test(view.container.textContent))
  await view.close()
  const archived = await mount(content, { cycle: { id: '2026' } })
  assert.equal(archived.container.textContent, ''); assert.equal(reads, 3); await archived.close()
})
test('public Explorer keeps Objective Match/filter/View and omits AI selection/batch/status columns', async t => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async url => {
    calls++; assert(!String(url).includes('/ai/'))
    return { ok: true, status: 200, json: async () => ({ success: true, data: { records: [{ id: 'app', studentId: 'student', driveId: 'drive', name: 'Candidate', objectiveMatch: { score: 82 }, drive: { role: 'Developer' } }], totalRecords: 1, page: 1, limit: 50, totalPages: 1 } }) }
  })
  const view = await mount(h(MemoryRouter, null, h(AuthContext.Provider, { value: { session: { accessToken: 'token' } } }, h(CompanyCandidateExplorerPage))))
  assert.equal(calls, 1)
  assert.match(view.container.textContent, /Objective Match/); assert.match(view.container.textContent, /82%/)
  assert(view.container.querySelector('a[href="/company/placement-drives/drive/applicants/student"]'))
  assert.equal(view.container.querySelectorAll('input[type=checkbox]').length, 0)
  assert(!/AI Fit|AI Status|Analyze Selected/.test(view.container.textContent)); await view.close()
})
after(async () => { dom.window.close(); await server.close() })
