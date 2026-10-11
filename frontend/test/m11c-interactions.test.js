import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import React, { act } from 'react'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const server = await createServer({ configFile: false, plugins: [(await import('@vitejs/plugin-react')).default()], define: { 'import.meta.env.VITE_APP_MODE': '"local"', 'import.meta.env.VITE_AI_ENABLED': '"false"' }, server: { middlewareMode: true, hmr: false }, appType: 'custom', cacheDir: 'node_modules/.vite-m11c-test' })
const load = path => server.ssrLoadModule(`/src/${path}`)
const { AuthContext } = await load('features/auth/auth.context.js')
const { PlacementCycleContext } = await load('features/placement-cycle/PlacementCycleContext.jsx')
const { StudentProfilePage } = await load('pages/StudentProfilePage.jsx')
const { CompanyNotificationsPage } = await load('pages/CompanyNotificationsPage.jsx')
const { AdminNotificationsPage } = await load('pages/AdminNotificationsPage.jsx')
const { AdminReportsPage } = await load('pages/AdminReportsPage.jsx')
const { AdminCommandCenter } = await load('components/analytics/AdminCommandCenter.jsx')
const { CompanyPlacementDriveApplicantsPage } = await load('pages/CompanyPlacementDriveApplicantsPage.jsx')
const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost:5173' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true })
const { createRoot } = await import('react-dom/client')
const h = React.createElement
let handler
globalThis.fetch = async (url, options = {}) => ({ ok: true, json: async () => ({ data: await handler(new URL(String(url)), options) }) })
const settle = () => new Promise(resolve => setTimeout(resolve, 15))
async function mount(Component, pathname = '/', role = 'placement_admin', props = {}) {
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container)
  await act(async () => { root.render(h(PlacementCycleContext.Provider, { value: { cycle: { id: '2027' } } }, h(AuthContext.Provider, { value: { session: { accessToken: 'test-token', user: { role, name: 'Tester' } } } }, h(MemoryRouter, { initialEntries: [pathname] }, h(Routes, null, h(Route, { path: pathname.includes('/applicants') ? '/company/placement-drives/:id/applicants' : '*', element: h(Component, props) })))))); await settle() })
  return { container, close: async () => { await act(async () => root.unmount()); container.remove() } }
}
async function click(element) { assert.ok(element, 'Expected control'); await act(async () => { element.click(); await settle() }) }
async function fill(element, value) {
  assert.ok(element, 'Expected editable control')
  await act(async () => { const proto = element.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : element.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value); element.dispatchEvent(new window.Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); await settle() })
}
const button = (view, name) => [...view.container.querySelectorAll('button')].find(b => b.textContent.trim() === name)
const field = (view, label) => [...view.container.querySelectorAll('label')].find(l => l.textContent.startsWith(label))?.querySelector('input,textarea,select')
const page = records => ({ records, totalRecords: records.length, page: 1, limit: 25, totalPages: 1 })

test('M11C career-interest editing stays mounted and saves the parsed list', async () => {
  const profile = { verificationStatus: 'verified', branch: 'IT', graduationYear: 2027, cgpa: 9, activeBacklogs: 0, phone: '12345678', rollNumber: 'IT001', class10: { board: 'CBSE', schoolName: 'School', passingYear: 2021, score: 90 }, class12: { board: 'CBSE', schoolName: 'School', passingYear: 2023, score: 90 }, semesterSpis: [{ semester: 1, spi: 9 }], skillGroups: [{ name: 'Programming', skills: ['Node'] }], projects: [{ title: 'Portal', description: 'Portal project', technologies: ['Node'] }], careerInterests: ['Cloud'] }
  let saved
  handler = async (url, options) => { if (options.method === 'PATCH') { saved = JSON.parse(options.body); return { ...profile, ...saved } }; if (url.pathname.endsWith('/branches')) return ['IT']; if (url.pathname.includes('/ai/')) return { deterministic: { score: 53 }, ai: { status: 'unavailable', reason: 'disabled' } }; return profile }
  const view = await mount(StudentProfilePage, '/student/profile', 'student')
  await fill(field(view, 'Career interests (comma-separated)'), 'Cloud, Systems, ')
  assert.match(view.container.textContent, /Placement profile/)
  await click(button(view, 'Save placement profile'))
  assert.deepEqual(saved.careerInterests, ['Cloud', 'Systems'])
  assert.equal(field(view, 'Career interests (comma-separated)').value, 'Cloud, Systems')
  await view.close()
})

test('M11C Company selected-target preview omits phase even after switching from a phase target', async () => {
  const previews = []
  handler = async (url, options) => { if (url.pathname.endsWith('/candidates/preview')) { previews.push(JSON.parse(options.body)); return { recipientCount: 2, recipients: [] } }; if (url.pathname.includes('/sent/page')) return page([]); if (url.pathname.endsWith('/placement-drives')) return [{ _id: 'drive', role: { title: 'Own drive' } }]; if (url.pathname.endsWith('/companies/me')) return { companyName: 'Company' }; return [] }
  const view = await mount(CompanyNotificationsPage, '/company/notifications', 'company')
  await click(button(view, 'Sent'))
  await fill(field(view, 'Drive'), 'drive'); await fill(field(view, 'Target'), 'selected')
  await fill(field(view, 'Title'), 'Update'); await fill(field(view, 'Message'), 'Review your journey')
  await click(button(view, 'Preview recipients'))
  assert.equal('phaseNumber' in previews[0], false)
  await fill(field(view, 'Target'), 'phase'); await fill(field(view, 'Phase'), '3'); await fill(field(view, 'Target'), 'selected')
  await click(button(view, 'Preview recipients'))
  assert.equal('phaseNumber' in previews[1], false)
  await view.close()
})

test('M11C reports clear stale previews and skip a request until the required drive exists', async () => {
  const requested = []
  handler = async url => { if (url.pathname.endsWith('/preview')) { requested.push(url.searchParams.get('type')); return { matchingRecords: 7, summary: { applicants: 10 } } }; return { options: { branches: [], companies: [], drives: [] } } }
  const view = await mount(AdminReportsPage)
  await click(button(view, 'CompanyRecruitment History'))
  assert.match(view.container.textContent, /7 matching records/)
  await click(button(view, 'DriveComplete Drive Workbook'))
  assert.match(view.container.textContent, /Choose a drive to preview/)
  assert.doesNotMatch(view.container.textContent, /7 matching records/)
  assert.equal(button(view, 'Export Excel'), undefined)
  assert.equal(requested.includes('complete_drive'), false)
  await view.close()
})

test('M11C Admin To date changes only dateTo in the analytics request', async () => {
  const queries = []
  handler = async url => { queries.push(url.searchParams); return { options: {}, summary: { cohort: { totalStudents: 0 } } } }
  const view = await mount(AdminCommandCenter, '/admin/dashboard', 'placement_admin', { token: 'test-token' })
  await fill(field(view, 'To'), '2026-10-31')
  assert.equal(queries.at(-1).get('dateTo'), '2026-10-31')
  assert.equal(queries.at(-1).has('dateFrom'), false)
  await view.close()
})

test('M11C Admin empty history retains recovery controls and successful send refreshes paged history', async () => {
  let sent = false; let historyReads = 0
  handler = async (url, options) => { if (url.pathname.includes('/companies/') && options.method === 'POST') { sent = true; return {} }; if (url.pathname.endsWith('/sent/page')) { historyReads++; return page(sent && !url.searchParams.get('search') ? [{ _id: 'new', title: 'New notice', message: 'Review', context: {}, createdAt: new Date().toISOString(), recipientCount: 1 }] : []) }; if (url.pathname.endsWith('/admin/companies')) return [{ _id: 'company', name: 'Company', company: { approvalStatus: 'approved', companyName: 'Company' } }]; return [] }
  const view = await mount(AdminNotificationsPage)
  await click(button(view, 'Sent'))
  const search = view.container.querySelector('[placeholder="Search sent"]')
  assert.ok(search); await fill(search, 'nonexistent')
  assert.ok(button(view, 'Clear filters')); await click(button(view, 'Clear filters'))
  const form = [...view.container.querySelectorAll('form')].find(f => f.textContent.includes('Notify an approved Company'))
  await fill(form.querySelector('select'), 'company')
  await fill(form.querySelector('input'), 'New notice'); await fill(form.querySelector('textarea'), 'Review')
  const before = historyReads
  await click(form.querySelector('button[type="submit"]'))
  assert.ok(historyReads > before, JSON.stringify({ sent, historyReads, before, form: form.innerHTML, content: view.container.textContent.slice(-1200) }))
  assert.match(view.container.textContent, /New notice/)
  await view.close()
})

test('M11C bulk selection excludes exited rows and move-back sends numeric Phase 0', async () => {
  let transition
  const candidates = ['active', 'rejected', 'absent', 'withdrawn', 'closed_placed_elsewhere', 'placement_confirmed'].map((currentStatus, i) => ({ applicationId: `a${i}`, studentId: `s${i}`, currentStatus, selection: {}, student: { name: `Student ${i}`, branch: 'IT' } }))
  handler = async (url, options) => { if (options.method === 'POST' && url.pathname.includes('transition')) { transition = JSON.parse(options.body); return {} }; if (url.pathname.includes('/candidates')) return { candidates }; if (url.pathname.includes('recipients')) return { recipientCount: 0 }; return { drive: { role: { title: 'Drive' }, lifecycleStatus: 'published', phases: [{ phaseNumber: 1, title: 'Round 1' }, { phaseNumber: 2, title: 'Round 2' }], phaseExecution: [] }, funnel: { phases: [] } } }
  const view = await mount(CompanyPlacementDriveApplicantsPage, '/company/placement-drives/drive/applicants', 'company')
  await click(button(view, 'Round 1'))
  const boxes = [...view.container.querySelectorAll('input[type="checkbox"]')]
  await click(boxes[0])
  assert.equal(boxes.filter(b => b.checked).length, 2)
  assert.equal(boxes.slice(2).every(b => b.disabled), true)
  await click(button(view, 'Move back selected'))
  await fill(field(view, 'Move to phase'), '0'); await fill(field(view, 'Reason'), 'Correction')
  await click(button(view, 'Confirm Move Backward'))
  assert.equal(transition.targetPhase, 0)
  await view.close()
})

after(async () => { await server.close(); dom.window.close() })
