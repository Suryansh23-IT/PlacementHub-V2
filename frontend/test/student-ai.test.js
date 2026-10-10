import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import React, { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', cacheDir: 'node_modules/.vite-student-ai-test' })
const { StudentInsightView, StudentIntelligence } = await server.ssrLoadModule('/src/features/ai/StudentIntelligence.jsx')
const { ContextualAskAi } = await server.ssrLoadModule('/src/features/ai/ContextualAskAi.jsx')
const { PlacementCycleContext } = await server.ssrLoadModule('/src/features/placement-cycle/PlacementCycleContext.jsx')
const { StudentPlacementDriveDetailPage } = await server.ssrLoadModule('/src/pages/StudentPlacementDriveDetailPage.jsx')
const { AuthContext } = await server.ssrLoadModule('/src/features/auth/auth.context.js')
const { MemoryRouter, Routes, Route } = await import('react-router-dom')
const h = React.createElement
const career = { deterministic: { score: 75, strengths: [{ text: 'Documented projects' }], improvementAreas: [{ text: 'Add experience' }], suitableRoles: ['Frontend Developer'], nextLearningSteps: ['Build a project'], profileSuggestions: ['Align resume evidence'] }, ai: { status: 'not_requested' } }
const match = { deterministic: { score: 85, label: 'Strong', matchedSkills: ['react'], missingSkills: ['sql'], weakerEvidence: ['javascript'], evidence: [{ title: 'Portal', skills: ['react'] }] }, ai: { status: 'not_requested' } }
const render = props => renderToStaticMarkup(h(StudentInsightView, props))

test('Career Assistant renders deterministic score, evidence, roles and truthful resume boundary', () => {
  const html = render({ data: career })
  for (const text of ['75/100', 'Add experience', 'Frontend Developer', 'Build a project', 'Align resume evidence', 'have not been analyzed']) assert(html.includes(text), text)
  assert(!html.includes('Documented projects')); assert(!html.includes('>Strengths<'))
})

test('Career dimension rows display backend earned/max values including zeros without recalculating', () => {
  const breakdown = [{ key: 'skills', label: 'Technical Skills', earnedPoints: 16, maximum: 20 }, { key: 'projects', label: 'Projects', earnedPoints: 15, maximum: 30 }, { key: 'experience', label: 'Experience', earnedPoints: 0, maximum: 15 }, { key: 'credentials', label: 'Credentials', earnedPoints: 5, maximum: 10 }, { key: 'direction', label: 'Career Direction', earnedPoints: 5, maximum: 10 }, { key: 'introduction', label: 'Professional Intro', earnedPoints: 3, points: 2.5, maximum: 5 }, { key: 'links', label: 'Professional Links', earnedPoints: 2, points: 2.5, maximum: 5 }, { key: 'resume', label: 'Resume Availability', earnedPoints: 5, maximum: 5 }]
  const html = render({ data: { ...career, deterministic: { ...career.deterministic, score: 51, breakdown } } })
  const document = new JSDOM(html).window.document
  assert.equal(document.querySelectorAll('dl > div').length, 8)
  const rows = [...document.querySelectorAll('dl > div')]
  for (const [index, row] of rows.entries()) { assert.equal(row.querySelector('dt').textContent, breakdown[index].label); assert.equal(row.querySelector('dd').textContent, `${breakdown[index].earnedPoints}/${breakdown[index].maximum}`) }
  assert.match(html, /51\/100/); assert.match(html, /0\/15/)
  assert(!render({ data: match, match: true }).includes('Profile Strength breakdown'))
})
test('Drive Match renders badge/evidence and separates official eligibility', () => {
  const html = render({ data: match, match: true })
  for (const text of ['85% · Strong', 'Matched skills', 'Not documented', 'Needs supporting evidence', 'Eligibility', 'sql']) assert(html.includes(text) || html.toLowerCase().includes(text.toLowerCase()), text)
  assert(!html.includes('Apply to Drive'))
})
test('loading, empty, insufficient and local AI unavailable states retain deterministic evidence', () => {
  assert.match(render({}), /Loading professional evidence/)
  assert.match(render({ data: { deterministic: { ...match.deterministic, score: null, label: 'Insufficient requirements', reason: 'No structured skills' } }, match: true }), /No structured skills/)
  const html = render({ data: { ...career, ai: { status: 'unavailable' } } })
  assert.match(html, /temporarily unavailable/); assert.match(html, /75\/100/)
  assert.match(render({ data: { ...career, deterministic: { ...career.deterministic, score: 0, strengths: [], suitableRoles: [] } } }), /0\/100/)
})
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:5173' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true })
const { createRoot } = await import('react-dom/client')
async function mount({ cycle = '2027', load, ask, assess, driveId, component } = {}) {
  localStorage.setItem('placementhub_active_cycle', cycle)
  const container = document.createElement('div'); document.body.append(container); const root = createRoot(container)
  const tree = nextCycle => h(PlacementCycleContext.Provider, { value: { cycle: { id: nextCycle } } }, component ?? h(StudentIntelligence, { token: 'synthetic', driveId, load, ask, assess: assess ?? (async () => ({ data: driveId ? match : career })) }))
  await act(async () => { root.render(tree(cycle)); await new Promise(resolve => setTimeout(resolve, 0)) })
  return { container, switchCycle: async cycle => { localStorage.setItem('placementhub_active_cycle', cycle); await act(async () => { root.render(tree(cycle)); await new Promise(resolve => setTimeout(resolve, 0)) }) }, close: async () => { await act(async () => root.unmount()); container.remove() } }
}
test('archived cycle hides Career Assistant and Drive Match without any API calls', async () => {
  let calls = 0
  for (const driveId of [undefined, 'drive']) {
    const view = await mount({ cycle: '2026', driveId, load: async () => { calls++; return { data: career } }, ask: async () => { calls++; throw new Error('Archived ask') } })
    assert.equal(view.container.textContent, ''); await view.close()
  }
  assert.equal(calls, 0)
})

test('shared Ask slot replaces previous question/answer, aborts stale work and escapes output', async () => {
  const requests = []
  const view = await mount({ component: h(ContextualAskAi, { title: 'Ask preparation', questions: ['First?', 'Second?', 'Third?', 'Fourth?'], onAsk: (question, signal) => new Promise(resolve => requests.push({ question, signal, resolve })) }) })
  assert.equal(view.container.querySelectorAll('button').length, 5)
  assert.equal(view.container.querySelector('input').maxLength, 500)
  await act(async () => { view.container.querySelectorAll('button')[0].click() })
  assert.match(view.container.textContent, /Preparing your answer/)
  await act(async () => { requests[0].resolve({ data: { ai: { status: 'available', analysis: { answer: 'First answer' } } } }) })
  assert.match(view.container.textContent, /First answer/)
  await act(async () => { view.container.querySelectorAll('button')[1].click() })
  assert(!view.container.textContent.includes('First answer'))
  await act(async () => { view.container.querySelectorAll('button')[2].click(); requests[1].resolve({ data: { ai: { status: 'available', analysis: { answer: 'Stale answer' } } } }) })
  assert.equal(requests[1].signal.aborted, true); assert(!view.container.textContent.includes('Stale answer'))
  await act(async () => { requests[2].resolve({ data: { ai: { status: 'available', analysis: { answer: '<script>plain text</script>' } } } }) })
  assert.equal(view.container.querySelector('script'), null)
  assert.equal(view.container.querySelectorAll('[aria-live] p')[0].textContent, 'You: Third?')
  assert.equal(view.container.querySelectorAll('[aria-live] p')[1].textContent, 'AI Coach: <script>plain text</script>')
  await view.close()
})

test('Student Ask features use contextual chips and preserve permanent analysis on failure', async () => {
  for (const driveId of [undefined, 'drive']) {
    const calls = []; const view = await mount({ driveId, load: async () => ({ data: driveId ? match : career }), ask: async (token, options) => { calls.push(options); throw new Error('Synthetic quota') } })
    assert.match(view.container.textContent, driveId ? /Ask AI about this role/ : /Ask AI about your preparation/)
    const chip = [...view.container.querySelectorAll('button')].find(button => button.textContent === (driveId ? 'How should I prepare for this job?' : 'What should I improve first?'))
    await act(async () => { chip.click() })
    assert.equal(calls[0].driveId, driveId); assert(!('history' in calls[0])); assert.match(view.container.textContent, /answer is temporarily unavailable/)
    assert.match(view.container.textContent, driveId ? /85% · Strong/ : /75\/100/)
    await view.close()
  }
})

test('pending Ask is aborted and late answer hidden on leaving the 2027 cycle', async () => {
  let signal; let resolve
  const view = await mount({ load: async () => ({ data: career }), ask: (token, options) => { signal = options.signal; return new Promise(done => { resolve = done }) } })
  await act(async () => { [...view.container.querySelectorAll('button')].find(button => button.textContent === 'What should I improve first?').click() })
  await view.switchCycle('2026'); assert.equal(signal.aborted, true)
  await act(async () => { resolve({ data: { ai: { status: 'available', analysis: { answer: 'Late advice' } } } }) })
  assert.equal(view.container.textContent, ''); await view.close()
})
test('Ask is the only explanation action and a successful reply leaves the calculated score unchanged', async () => {
  const calls = []; const view = await mount({ load: async (token, options) => { calls.push(options); return { data: career } }, ask: async () => ({ data: { ai: { status: 'available', analysis: { answer: 'Improve your project evidence first.' } } } }) })
  assert.equal(calls.length, 1); assert.equal(calls[0].explain, undefined)
  assert(!view.container.textContent.includes('Explain and suggest'))
  await act(async () => { [...view.container.querySelectorAll('button')].find(button => button.textContent === 'What should I improve first?').click(); await new Promise(resolve => setTimeout(resolve, 0)) })
  assert.equal(calls.length, 1); assert.match(view.container.textContent, /75\/100/); assert.match(view.container.textContent, /Improve your project evidence first/); await view.close()
})
test('switching away from 2027 aborts pending work and hides late results', async () => {
  let release; let signal
  const view = await mount({ load: (token, options) => { signal = options.signal; return new Promise(resolve => { release = () => resolve({ data: career }) }) } })
  await view.switchCycle('2026'); assert.equal(signal.aborted, true)
  await act(async () => { release(); await new Promise(resolve => setTimeout(resolve, 0)) })
  assert.equal(view.container.textContent, ''); await view.close()
})
test('Drive Detail Apply remains disabled for ineligible students even with a Strong match', async () => {
  const original = globalThis.fetch; const drive = { role: { title: 'Developer' }, company: { companyName: 'Synthetic company' }, eligibilityResult: { eligible: false, reasons: [{ code: 'CGPA', message: 'Minimum CGPA not met' }] }, applicationWindow: { open: true }, driveDetails: { applicationDeadline: '2099-01-01' }, eligibility: {}, phases: [] }
  globalThis.fetch = async url => ({ ok: true, json: async () => ({ data: String(url).includes('/ai/') ? match : drive }) })
  try {
    const component = h(AuthContext.Provider, { value: { session: { accessToken: 'synthetic', user: { role: 'student' } } } }, h(MemoryRouter, { initialEntries: ['/student/placement/drive'] }, h(Routes, null, h(Route, { path: '/student/placement/:id', element: h(StudentPlacementDriveDetailPage) }))))
    const view = await mount({ component })
    assert.match(view.container.textContent, /85% · Strong/)
    const apply = [...view.container.querySelectorAll('button')].find(button => button.textContent === 'Apply to Drive')
    assert.equal(apply.disabled, true); assert.match(view.container.textContent, /Minimum CGPA not met/); await view.close()
  } finally { globalThis.fetch = original }
})
after(async () => { await server.close(); dom.window.close() })

test('separate objective and AI scores render with timestamp, stale warning and actual rubric points', () => {
  const assessment = { score: 50, analyzedAt: '2026-10-10T00:00:00.000Z', stale: true, summary: 'Independent grounded assessment.', sections: [{ key: 'projects', label: 'Project quality', earnedPoints: 12, maximum: 25, reason: 'Documented work needs outcomes.' }] }
  const html = render({ data: { ...career, assessment, resumeStatus: 'extracted' } })
  for (const text of ['Student Profile Score: 75/100', 'AI Assessment Score', '50/100', '12/25', 'Last analyzed:', 'refresh AI analysis', 'Refresh AI Analysis']) assert(html.includes(text), text)
  assert(!html.includes('Hybrid')); assert(!html.includes('80%'))
  const drive = render({ match: true, data: { ...match, assessment } })
  assert(drive.includes('Objective Match')); assert(drive.includes('AI Role Fit')); assert(drive.includes('50%'))
})

test('assessment is manual only; refresh retains old result, blocks duplicates and preserves it on failure', async () => {
  for (const driveId of [undefined, 'drive']) {
    const base = driveId ? match : career
    const prior = { score: 50, analyzedAt: '2026-10-10T00:00:00.000Z', stale: false, sections: [], summary: 'Previous successful opinion' }
    let calls = 0; let resolve
    const view = await mount({ driveId, load: async () => ({ data: { ...base, assessment: prior } }), assess: () => { calls++; return new Promise(done => { resolve = done }) } })
    assert.equal(calls, 0)
    const button = [...view.container.querySelectorAll('button')].find(row => row.textContent === 'Refresh AI Analysis')
    await act(async () => { button.click(); button.click() })
    assert.equal(calls, 1); assert(button.disabled); assert.match(view.container.textContent, /Previous successful opinion/)
    assert.match(view.container.textContent, /Analyzing/)
    await act(async () => resolve({ data: { ...base, assessment: null, ai: { status: 'unavailable', reason: 'timeout' } } }))
    assert.match(view.container.textContent, /Previous successful opinion/); assert.match(view.container.textContent, /temporarily unavailable/)
    await view.close()
    const remount = await mount({ driveId, load: async () => ({ data: { ...base, assessment: prior } }), assess: () => { calls++; throw new Error('Must not auto-generate') } })
    assert.equal(calls, 1); assert.match(remount.container.textContent, /Previous successful opinion/); await remount.close()
  }
})

test('provider-neutral quota, busy and rate-limit Ask states keep the permanent score', async () => {
  for (const reason of ['quota', 'rate_limited', 'busy']) {
    const view = await mount({ load: async () => ({ data: career }), ask: async () => {
      if (reason === 'rate_limited') { const error = new Error('Limited'); error.statusCode = 429; throw error }
      return { data: { ai: { status: 'unavailable', reason } } }
    } })
    await act(async () => [...view.container.querySelectorAll('button')].find(button => button.textContent === 'What should I improve first?').click())
    assert.match(view.container.textContent, reason === 'quota' ? /AI provider has reached its usage limit/ : reason === 'busy' ? /AI is answering another request/ : /Too many AI requests/)
    assert.match(view.container.textContent, /75\/100/); assert.match(view.container.textContent, /You:/)
    await view.close()
  }
})
