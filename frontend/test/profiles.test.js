import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import React, { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', cacheDir: 'node_modules/.vite-profile-test' })
const { SocialProfileView, MainProfileView } = await server.ssrLoadModule('/src/features/profiles/ProfileViews.jsx')
const { ProfileAvatar } = await server.ssrLoadModule('/src/features/profiles/ProfileAvatar.jsx')
const { ProfileIdentity } = await server.ssrLoadModule('/src/features/profiles/ProfileIdentity.jsx')
const { PostCard } = await server.ssrLoadModule('/src/features/community/CommunityPostCard.jsx')
const { CommunityComments } = await server.ssrLoadModule('/src/features/community/CommunityFeed.jsx')
const { SocialProfilePage } = await server.ssrLoadModule('/src/pages/SocialProfilePage.jsx')
const { AuthContext } = await server.ssrLoadModule('/src/features/auth/auth.context.js')
const { PlacementCycleContext } = await server.ssrLoadModule('/src/features/placement-cycle/PlacementCycleContext.jsx')
const h = React.createElement, render = component => renderToStaticMarkup(h(MemoryRouter, null, component))
const student = { userId: '000000000000000000000001', role: 'student', name: 'Student One', label: 'Student', branch: 'Information Technology', graduationYear: 2027, headline: 'Engineer', about: 'Building useful projects', skills: ['JavaScript'], canViewMainProfile: true }
const company = { userId: '000000000000000000000002', role: 'company', name: 'Nexora Digital Labs', label: 'Company', industry: 'Technology', location: 'India', about: 'Professional company', website: 'https://example.test' }
const admin = { userId: '000000000000000000000003', role: 'placement_admin', name: 'Placement Administration', label: 'Official', institutionName: 'Apex Institute of Technology', headline: 'Training & Placement Cell' }
for (const profile of [student, company, admin]) test(`${profile.role} Social Profile shows safe identity and correct default visual`, () => {
 const html = render(h(SocialProfileView, { profile, viewerRole: 'student' }))
 assert.match(html, new RegExp(profile.name)); assert.match(html, new RegExp(profile.label)); assert.match(html, new RegExp(profile.role === 'student' ? 'Student default avatar' : profile.role === 'company' ? 'Company default avatar' : 'Apex Institute of Technology logo')); assert.doesNotMatch(html, /View Main Profile/)
})
for (const viewerRole of ['company', 'placement_admin']) test(`${viewerRole} sees Main Profile link only for Students`, () => {
 const html = render(h(SocialProfileView, { profile: student, viewerRole })); assert.match(html, /View Main Profile/); assert.match(html, /\/community\/profiles\/000000000000000000000001\/main-profile/)
 for (const profile of [company, admin]) assert.doesNotMatch(render(h(SocialProfileView, { profile: { ...profile, canViewMainProfile: true }, viewerRole })), /View Main Profile/)
})
test('student and company avatars are distinct; existing AIT SVG is reused; real image slot supported', () => { const s = render(h(ProfileAvatar, { role: 'student' })), c = render(h(ProfileAvatar, { role: 'company' })), a = render(h(ProfileAvatar, { role: 'placement_admin' })); assert.notEqual(s, c); assert.match(a, /apex-blue/); assert.match(render(h(ProfileAvatar, { role: 'student', name: 'Student', src: '/safe.png' })), /safe.png/) })
test('Community post and comment names/avatars link to safe Social Profile identifiers', () => {
 const author = { ...student, detail: student.branch }
 const post = { _id: 'post', content: 'Update', contentType: 'feed', author, createdAt: '2026-01-01', likeCount: 0, commentCount: 0 }
 for (const component of [h(PostCard, { post }), h(CommunityComments, { comments: [{ _id: 'comment', content: 'Reply', author, createdAt: post.createdAt }], onRemove() {} })]) { const html = render(component); assert.match(html, /href="\/community\/profiles\/000000000000000000000001"/); assert.match(html, /Student default avatar/); assert.match(html, /Information Technology · Student/) }
 assert.doesNotMatch(render(h(ProfileIdentity, { author: { name: 'Unknown', role: 'student' } })), /undefined/)
})
test('Main Profile presents all professional sections without placement/document widgets', () => {
 const item = { title: 'Evidence', organization: 'College', description: 'Professional evidence', role: 'Lead', technologies: ['React'], url: 'https://example.test', startDate: '2026-01-01' }
 const html = render(h(MainProfileView, { profile: { ...student, softSkills: ['Communication'], targetRole: 'Engineer', careerInterests: ['Systems'], projects: [item], internships: [item], certifications: [item], achievements: [item], extracurriculars: [item], leadership: [item], professionalLinks: { github: 'https://github.com/example' }, codingProfiles: [{ platform: 'Code', url: 'https://example.test' }] } }))
 for (const text of ['About', 'Technical skills', 'Soft skills', 'Communication', 'Projects', 'Internships / experience', 'Certifications', 'Achievements', 'Extracurricular activities / clubs / volunteering', 'Leadership / responsibility', 'Professional &amp; coding links']) assert.match(html, new RegExp(text))
 assert.doesNotMatch(html, /Download resume|Verification|Applications|CGPA|Backlogs/)
})
test('missing optional professional fields render gracefully and unsafe website links do not render', () => { const html = render(h(MainProfileView, { profile: { ...student, about: '', skills: [] } })); assert.match(html, /professional introduction has not been added/); assert.match(html, /No separate soft skills/); assert.doesNotMatch(render(h(SocialProfileView, { profile: { ...company, website: 'javascript:alert(1)' }, viewerRole: 'student' })), /href="javascript:/) })
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:5173' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true })
const { createRoot } = await import('react-dom/client')
const originalFetch = globalThis.fetch
async function mount({ role = 'company', main = false, cycle = '2027', data = student, fail = false, handle } = {}) {
 const container = document.createElement('div'); document.body.append(container); const root = createRoot(container), calls = []
 localStorage.setItem('placementhub_active_cycle', cycle)
 globalThis.fetch = async (url, options) => { calls.push(String(url)); if (String(url).includes('/social/notifications')) return {ok:true,json:async()=>({data:{unreadCount:0,records:[]}})}; if (handle) return handle(String(url), options); return { ok: !fail, status: fail ? 404 : 200, json: async () => fail ? { message: 'Profile was not found.' } : { data } } }
 await act(async () => { root.render(h(PlacementCycleContext.Provider, { value: { cycle: { id: cycle } } }, h(AuthContext.Provider, { value: { session: { accessToken: 'test', user: { role } } } }, h(MemoryRouter, { initialEntries: ['/community/profiles/' + student.userId] }, h(Routes, null, h(Route, { path: '/community/profiles/:userId', element: h(SocialProfilePage, { main }) })))))); await new Promise(resolve => setTimeout(resolve, 0)) })
 return { container, calls, close: async () => { await act(async () => root.unmount()); container.remove() } }
}
test('profile page fetches safe endpoint and renders response; missing user displays API error', async () => { let view = await mount(); assert.match(view.container.textContent, /Student One/); assert.match(view.calls.find(url=>url.includes('/social/profiles/')), /\/social\/profiles\//); await view.close(); view = await mount({ fail: true }); assert.match(view.container.textContent, /Profile was not found/); await view.close() })
test('2026 profile pages and Student direct Main Profile access make no API request', async () => { for (const options of [{ cycle: '2026' }, { cycle: '2026', main: true }, { role: 'student', main: true }]) { const view = await mount(options); assert.equal(view.calls.length, 0); assert.match(view.container.textContent, /only|Only/); await view.close() } })
test('Company Main Profile page uses protected main endpoint', async () => { const view = await mount({ main: true }); assert.match(view.calls.find(url=>url.includes('/social/profiles/')), /\/main-profile$/); assert.match(view.container.textContent, /Soft skills/); await view.close() })

test('creative Student Social Profile renders hobbies, interests, campus life, soft skills and self-selected personality', () => {
 const html = render(h(SocialProfileView, { profile: { ...student, hobbies: ['Music'], interests: ['Design'], softSkills: ['Communication'], personalityType: 'ENFP', achievementHighlights: ['Club showcase'], clubs: ['Photography'], extracurriculars: ['Cricket'], volunteering: ['Tutoring'], languages: ['English'], currentlyLearning: ['React'], lookingToExplore: ['Entrepreneurship'], links: { github: 'https://github.com/example' } }, viewerRole: 'student' }))
 for (const text of ['Music','Design','Communication','ENFP','Self-selected','Club showcase','Photography','Cricket','Tutoring','English','React','Entrepreneurship','Social / professional links']) assert(html.includes(text), text)
 assert.doesNotMatch(html, /View Main Profile|Projects|Internships|Download resume/)
})
test('Company representative displays only explicit public details and hiring domains', () => {
 const html = render(h(SocialProfileView, { profile: { ...company, representativeName: 'Demo Recruiter', designation: 'Campus Recruiter', publicEmail: 'public@example.test', publicPhone: '+91 100 200', hiringDomains: ['Web'], email: 'PRIVATE_LOGIN', phone: 'PRIVATE_PHONE' }, viewerRole: 'student' }))
 for (const text of ['Account / recruiter representative','Demo Recruiter','Campus Recruiter','public@example.test','+91 100 200','Hiring domains']) assert(html.includes(text))
 assert.doesNotMatch(html, /PRIVATE|View Main Profile/)
})
test('own Student/Company and Admin management show edit action; foreign Student profile does not', async () => {
 for (const [role,data] of [['student',{...student,canEdit:true}],['company',{...company,canEdit:true}],['placement_admin',{...student,canEdit:true}],['student',{...student,canEdit:false}]]) {
  const view = await mount({role,data}); assert.equal(view.container.textContent.includes('Edit Social Profile'), data.canEdit)
  if (role === 'student') assert(!view.container.textContent.includes('View Main Profile'))
  await view.close()
 }
})
test('Social editor starts with safe defaults and saves creative fields only through Social Profile PATCH', async () => {
 let saved
 const view = await mount({ role:'student', data:{...student,canEdit:true}, handle: async (url,options) => { if(options?.method === 'PATCH') saved=JSON.parse(options.body); return {ok:true,status:200,json:async()=>({data:saved?{...student,...saved,about:saved.bio,canEdit:true}:{...student,canEdit:true}})} } })
 try {
  await act(async()=>{[...view.container.querySelectorAll('button')].find(x=>x.textContent==='Edit Social Profile').click()})
  assert.match(view.container.textContent,/Main Profile and placement records stay unchanged/)
  assert.equal(view.container.querySelector('input[maxlength="160"]').value,student.headline)
  for (const [label,value] of [['Hobbies','Music, Cricket'],['Soft skills','Communication, Teamwork'],['Currently learning','React']]) {
   const field=[...view.container.querySelectorAll('label')].find(x=>x.textContent.includes(label)).querySelector('textarea')
   await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value').set.call(field,value);field.dispatchEvent(new dom.window.Event('input',{bubbles:true}))})
  }
  await act(async()=>{[...view.container.querySelectorAll('button')].find(x=>x.textContent==='Save Social Profile').click();await new Promise(r=>setTimeout(r,0))})
  assert.deepEqual(saved.hobbies,['Music','Cricket']);assert.deepEqual(saved.softSkills,['Communication','Teamwork']);assert.equal(saved.bio,student.about)
  assert(view.calls.every(url=>url.includes('/social/profiles/')||url.includes('/social/notifications')));assert(!view.calls.some(url=>url.includes('/main-profile')))
  assert.match(view.container.textContent,/Music/)
 } finally {await view.close()}
})
test('Company editor has public contact/logo fields; Official editor keeps AIT logo and has no upload', async () => {
 for (const profile of [company,admin]) {
  const view=await mount({role:profile.role,data:{...profile,canEdit:true}})
  await act(async()=>{[...view.container.querySelectorAll('button')].find(x=>x.textContent==='Edit Social Profile').click()})
  assert.match(view.container.textContent,/Login email is never copied/)
  assert.equal(view.container.querySelectorAll('input[type=file]').length,profile.role==='company'?1:0)
  assert.match(view.container.textContent,/Public professional email/)
  await view.close()
 }
})
test('saved Social avatar loads using protected endpoint and graceful default is retained on failure', async () => {
 const create=URL.createObjectURL,revoke=URL.revokeObjectURL;URL.createObjectURL=()=> 'blob:social-avatar';URL.revokeObjectURL=()=>{}
 let view
 try {
  view=await mount({data:{...student,hasAvatar:true,avatarVersion:'v1'},handle:async url=>url.endsWith('/avatar')?{ok:true,blob:async()=>new Blob(['png'])}:{ok:true,json:async()=>({data:{...student,hasAvatar:true,avatarVersion:'v1'}})}})
  assert.equal(view.container.querySelector('img').getAttribute('src'),'blob:social-avatar');assert(view.calls.some(url=>url.endsWith('/avatar')))
  await view.close();view=null
  view=await mount({data:{...student,hasAvatar:true},handle:async url=>url.endsWith('/avatar')?{ok:false}:{ok:true,json:async()=>({data:{...student,hasAvatar:true}})}})
  assert(view.container.querySelector('svg[aria-label="Student default avatar"]'))
 } finally {if(view)await view.close();URL.createObjectURL=create;URL.revokeObjectURL=revoke}
})
after(async () => { globalThis.fetch = originalFetch; await server.close(); dom.window.close() })
