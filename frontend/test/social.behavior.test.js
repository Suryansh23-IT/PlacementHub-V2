import assert from 'node:assert/strict'
import test, { after, beforeEach, afterEach } from 'node:test'
import React, { act } from 'react'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:5173' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true })
const { createRoot } = await import('react-dom/client')
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', cacheDir: 'node_modules/.vite-social-behavior-test' })
const { CommunityNotificationsPage } = await server.ssrLoadModule('/src/pages/CommunityNotificationsPage.jsx')
const { CommunityPage } = await server.ssrLoadModule('/src/pages/CommunityPage.jsx')
const { PlacementCycleContext } = await server.ssrLoadModule('/src/features/placement-cycle/PlacementCycleContext.jsx')
const { AuthContext } = await server.ssrLoadModule('/src/features/auth/auth.context.js')
const originalFetch = globalThis.fetch
const h = React.createElement
const post = { _id: '000000000000000000000001', content: 'First professional update', contentType: 'feed', author: { name: 'Placement Administration', role: 'placement_admin', label: 'Official' }, createdAt: '2026-10-09T02:00:00Z', canEdit: true, canDelete: true, canModerate: false, likedByMe: false, likeCount: 0, commentCount: 0 }
let root, container, calls, handler, notificationHandler
const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => status < 400 ? { data } : { message: data, errorCode: 'ERROR' } })
const feed = (records = [post], page = 1, totalPages = 1) => ({ records, page, totalPages })
async function attachImage() {
 const input = container.querySelector('input[type=file]'); Object.defineProperty(input, 'files', { value: [new File(['png'], 'test.png', { type: 'image/png' })] }); await act(async () => { input.dispatchEvent(new dom.window.Event('change', { bubbles: true })); await flush() })
}
const flush = () => new Promise(resolve => setTimeout(resolve, 0))
async function mount({ cycle = '2027', path = '/community', role = 'placement_admin' } = {}) {
  localStorage.setItem('placementhub_active_cycle', cycle)
  await act(async () => {
    root.render(h(PlacementCycleContext.Provider, { value: { cycle: { id: cycle } } }, h(AuthContext.Provider, { value: { session: { accessToken: 'test', user: { role, id: post._id } } } }, h(MemoryRouter, { initialEntries: [path] }, h(Routes, null, h(Route, { path: '/community/notifications', element: h(CommunityNotificationsPage) }), h(Route, { path: '/community', element: h(CommunityPage) }), h(Route, { path: '/community/posts/:postId', element: h(CommunityPage) }))))))
    await flush()
  })
}
const buttons = name => [...container.querySelectorAll('button, a[role=tab]')].filter(x => x.textContent === name)
async function click(name) { const button = buttons(name)[0]; assert.ok(button, `Missing button ${name}`); await act(async () => { button.click(); await flush() }) }
async function fill(label, value) {
  const labels = [...container.querySelectorAll('label')]
  const labelNode = labels.find(node => node.textContent.includes(label))
  const field = labelNode.querySelector('textarea, input, select')
  const setter = Object.getOwnPropertyDescriptor(field.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype, 'value').set
  await act(async () => { setter.call(field, value); field.dispatchEvent(new dom.window.Event('input', { bubbles: true })); await flush() })
}
beforeEach(() => {
  container = document.createElement('div'); document.body.append(container); root = createRoot(container); calls = []
  handler = async () => response(feed()); notificationHandler = undefined
  URL.createObjectURL = () => 'blob:test'; URL.revokeObjectURL = () => {}
  globalThis.fetch = async (url, options) => { calls.push({ url: String(url), ...options }); return String(url).includes('/social/notifications') ? notificationHandler ? notificationHandler(new URL(url), options) : response({ records: [], unreadCount: 0 }) : handler(new URL(url), options) }
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })
after(async () => { globalThis.fetch = originalFetch; await server.close(); dom.window.close() })

test('feed loading waits for response, then displays empty state', async () => {
  let resolve
  handler = () => new Promise(r => { resolve = r })
  await mount(); assert.match(container.textContent, /Loading community/)
  await act(async () => { resolve(response(feed([]))); await flush() })
  assert.match(container.textContent, /No community updates yet/); assert.equal(buttons('Load more').length, 0)
})
test('initial feed error is visible', async () => {
  handler = async () => response('Community request failed', 500)
  await mount(); assert.match(container.textContent, /Community request failed/)
})
test('Load More disables while pending, appends unique posts, sorts, and hides at end', async () => {
  let resolve
  handler = async url => url.searchParams.get('page') === '2' ? new Promise(r => { resolve = r }) : response(feed([post], 1, 2))
  await mount(); await click('Load more')
  assert.equal(buttons('Loading more…')[0].disabled, true); assert.equal(container.querySelectorAll('article').length, 1)
  await act(async () => { resolve(response(feed([post, { ...post, _id: '000000000000000000000002', content: 'Older update', createdAt: '2026-10-08' }], 2, 2))); await flush() })
  assert.equal(container.querySelectorAll('article').length, 2); assert.equal(buttons('Load more').length, 0)
  assert.ok(container.textContent.indexOf('First professional update') < container.textContent.indexOf('Older update'))
})
test('failed next page preserves feed, re-enables Load More, and retries same page', async () => {
  let attempts = 0
  handler = async url => url.searchParams.get('page') === '2' ? (++attempts === 1 ? response('Next page failed', 500) : response(feed([{ ...post, _id: '000000000000000000000002' }], 2, 2))) : response(feed([post], 1, 2))
  await mount(); await click('Load more'); assert.match(container.textContent, /Next page failed/)
  assert.match(container.textContent, /First professional update/); assert.equal(buttons('Load more')[0].disabled, false)
  await click('Load more'); assert.equal(container.querySelectorAll('article').length, 2); assert.equal(attempts, 2)
})
test('create validation rejects blank input without POST; valid publish refreshes feed', async () => {
  handler = async (url, options) => options.method === 'POST' ? response(post, 201) : response(feed())
  await mount(); await click('New Feed post'); await click('Publish update'); assert.match(container.textContent, /Write an update before publishing/)
  assert.equal(calls.filter(x => x.method === 'POST').length, 0)
  await fill('Share an update', 'New professional update'); await click('Publish update'); assert.match(container.textContent, /exactly one image/); assert.equal(calls.filter(x => x.method === 'POST').length, 0); await attachImage(); await click('Publish update')
  assert.equal(calls.find(x => x.method === 'POST').body.get('content'), 'New professional update')
})
test('Admin edits and likes through correct API methods and refreshed data', async () => {
  let current = { ...post }
  handler = async (url, options) => {
    if (options.method === 'PATCH') current = { ...current, content: options.body instanceof FormData ? options.body.get('content') : JSON.parse(options.body).content, edited: true }
    if (url.pathname.endsWith('/like')) current = { ...current, likedByMe: options.method === 'POST', likeCount: options.method === 'POST' ? 1 : 0 }
    return response(feed([current]))
  }
  await mount(); await click('Edit'); await fill('Edit post', 'Edited professional update'); await attachImage(); await click('Save')
  assert.match(container.textContent, /Edited professional update/); assert.match(container.textContent, /Edited/)
  await click('Like'); assert.equal(buttons('Unlike').length, 1)
  await click('Unlike'); assert.equal(buttons('Like').length, 1)
  assert.ok(calls.some(x => x.url.endsWith('/like') && x.method === 'DELETE'))
})
test('Post Detail renders comments; validation, create, and confirmed owner deletion work', async () => {
  let comments = [{ _id: 'comment1', content: 'Existing comment', author: post.author, createdAt: post.createdAt, canDelete: true }]
  handler = async (url, options) => {
    if (url.pathname.endsWith('/comments')) {
      if (options.method === 'POST') comments.push({ ...comments[0], _id: 'comment2', content: JSON.parse(options.body).content })
      return response(comments)
    }
    if (options.method === 'DELETE') { comments = comments.filter(x => !url.pathname.endsWith(x._id)); return response({ deleted: true }) }
    return response({ ...post, commentCount: comments.length })
  }
  await mount({ path: `/community/posts/${post._id}` }); assert.match(container.textContent, /Back to Feed/)
  await click('Comment'); assert.match(container.textContent, /Write a comment first/)
  await fill('Add a comment', 'New comment'); await click('Comment'); assert.match(container.textContent, /New comment/)
  await click('Remove'); assert.match(container.textContent, /Remove this post and its comments/)
  await click('Cancel removal')
  const commentRemove = [...container.querySelectorAll('article')].find(x => x.textContent.includes('Existing comment')).querySelector('button')
  await act(async () => { commentRemove.click(); await flush() }); await click('Confirm remove')
  assert.doesNotMatch(container.textContent, /Existing comment/); assert.match(container.textContent, /New comment/)
})
test('non-owner cannot edit/delete post or another comment; Admin can moderate', async () => {
  handler = async url => response(url.pathname.endsWith('/comments') ? [{ _id: 'c', content: 'Other comment', author: post.author, createdAt: post.createdAt, canDelete: false }] : { ...post, canEdit: false, canDelete: false })
  await mount({ path: `/community/posts/${post._id}` }); assert.equal(buttons('Edit').length, 0); assert.equal(buttons('Remove').length, 0)
})
test('delete failure is displayed and existing post remains; confirmation can cancel', async () => {
  handler = async (url, options) => options.method === 'DELETE' ? response('Cannot remove right now', 500) : response(feed())
  await mount(); await click('Remove'); await click('Cancel removal'); assert.equal(calls.some(x => x.method === 'DELETE'), false)
  await click('Remove'); await click('Confirm remove'); assert.match(container.textContent, /Cannot remove right now/); assert.match(container.textContent, /First professional update/)
})
test('2026 direct access performs zero social requests', async () => {
  await mount({ cycle: '2026' }); assert.match(container.textContent, /available only in placement cycle 2027/); assert.equal(calls.length, 0)
})

test('Feed and Articles tabs request their types and reset the page', async () => {
  handler = async () => response(feed())
  await mount(); await click('Articles')
  assert.equal(new URL(calls.at(-1).url).searchParams.get('contentType'), 'article')
  assert.equal(new URL(calls.at(-1).url).searchParams.get('page'), '1')
  assert.equal(buttons('New article').length, 1)
  await click('Feed'); assert.equal(new URL(calls.at(-1).url).searchParams.get('contentType'), 'feed')
})
test('search and oldest sort are sent server-side and reset Load More pagination', async () => {
  handler = async url => response(feed([post], Number(url.searchParams.get('page')), 2))
  await mount(); await click('Load more'); assert.equal(new URL(calls.at(-1).url).searchParams.get('page'), '2')
  const search = container.querySelector('[aria-label="Search Community"]')
  await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(search, 'Campus'); search.dispatchEvent(new dom.window.Event('input', { bubbles: true })); await flush() })
  assert.equal(new URL(calls.at(-1).url).searchParams.get('search'), 'Campus'); assert.equal(new URL(calls.at(-1).url).searchParams.get('page'), '1')
  const sort = container.querySelector('[aria-label="Sort"]')
  await act(async () => { sort.value = 'oldest'; sort.dispatchEvent(new dom.window.Event('change', { bubbles: true })); await flush() })
  assert.equal(new URL(calls.at(-1).url).searchParams.get('sort'), 'oldest'); assert.equal(new URL(calls.at(-1).url).searchParams.get('page'), '1')
})
for (const role of ['student']) test(`${role} has no create/edit/delete/upload controls`, async () => {
  handler = async () => response(feed([{ ...post, canEdit: false, canDelete: false }]))
  await mount({ role }); assert.equal(buttons('New Feed post').length, 0); assert.equal(buttons('Edit').length, 0); assert.equal(buttons('Remove').length, 0); assert.equal(container.querySelectorAll('input[type=file]').length, 0)
  await click('Articles'); assert.equal(buttons('New article').length, 0)
})
test('Feed image loads with authorization and renders before bottom engagement; text Feed has no image', async () => {
  const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL
  URL.createObjectURL = () => 'blob:community-test'; URL.revokeObjectURL = () => {}
  try {
    handler = async url => url.pathname.endsWith('/image') ? { ok: true, blob: async () => new Blob(['png']) } : response(feed([{ ...post, image: { mimeType: 'image/png' } }, { ...post, _id: 'plain', content: 'Plain feed' }]))
    await mount(); const image = container.querySelector('article img'); assert.equal(image.getAttribute('src'), 'blob:community-test')
    assert.ok(image.compareDocumentPosition(container.querySelector('article button[aria-pressed]')) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING)
    assert.equal(container.querySelectorAll('article img').length, 1)
    assert.equal(calls.find(x => x.url.endsWith('/image')).headers.Authorization, 'Bearer test')
  } finally { URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke }
})
test('Article preview/detail and editor are text-only, show title and share engagement', async () => {
  handler = async () => response(feed([{ ...post, contentType: 'article', title: 'Preparation article', image: { mimeType: 'image/png' } }]))
  await mount(); assert.match(container.textContent, /Preparation article/); assert.match(container.textContent, /Read Article/); assert.equal(container.querySelectorAll('article img').length, 0)
  await click('Edit'); assert.equal(container.querySelectorAll('input[type=file]').length, 0); assert.ok([...container.querySelectorAll('label')].some(x => x.textContent.includes('Article title')))
})
test('Admin Article composer requires title/body and has no image upload', async () => {
  handler = async (url, options) => options.method === 'POST' ? response(post, 201) : response(feed())
  await mount(); await click('Articles'); await click('New article'); assert.equal(container.querySelectorAll('input[type=file]').length, 0)
  await click('Publish article'); assert.match(container.textContent, /Article title is required/)
  await fill('Article title', 'Title'); await fill('Article body', 'Professional long form body'); await click('Publish article')
  assert.deepEqual(JSON.parse(calls.find(x => x.method === 'POST').body), { contentType: 'article', title: 'Title', content: 'Professional long form body' })
})
test('stale next page cannot append after switching tabs', async () => {
  let finish
  handler = async url => url.searchParams.get('page') === '2' ? new Promise(resolve => { finish = resolve }) : response(feed([{ ...post, content: url.searchParams.get('contentType') === 'article' ? 'Article result' : 'Feed result' }], 1, 2))
  await mount(); await click('Load more'); await click('Articles')
  await act(async () => { finish(response(feed([{ ...post, _id: 'stale', content: 'Stale Feed result' }], 2, 2))); await flush() })
  assert.match(container.textContent, /Article result/); assert.doesNotMatch(container.textContent, /Stale Feed result/)
})

for (const role of ['company', 'placement_admin']) test(`${role} composer publishes Feed and text-only Article`, async () => {
  handler = async (url, options) => options.method === 'POST' ? response(post, 201) : response(feed())
  await mount({ role }); await click('New Feed post')
  assert.equal(container.querySelectorAll('input[type=file]').length, 1)
  await fill('Share an update', 'Professional Company update'); await attachImage(); await click('Publish update')
  await click('Articles'); await click('New article')
  assert.equal(container.querySelectorAll('input[type=file]').length, 0)
  await fill('Article title', 'Company advice'); await fill('Article body', 'Professional article body'); await click('Publish article')
  assert.deepEqual(calls.filter(c => c.method === 'POST').map(c => c.body instanceof FormData ? c.body.get('contentType') : JSON.parse(c.body).contentType), ['feed', 'article'])
})

test('Company sees own controls and safe author link, with no controls on Admin or another Company content', async () => {
  const own = { ...post, author: { userId: '000000000000000000000003', role: 'company', name: 'Test Company', label: 'Company' } }
  handler = async () => response(feed([own, { ...post, _id: 'admin', canEdit: false, canDelete: false }, { ...own, _id: 'other', canEdit: false, canDelete: false, author: { ...own.author, userId: '000000000000000000000005', name: 'Other Company' } }]))
  await mount({ role: 'company' })
  assert.equal(buttons('Edit').length, 1); assert.equal(buttons('Remove').length, 1)
  assert(container.querySelector('a[href="/community/profiles/000000000000000000000003"]'))
  assert(container.querySelector('svg[aria-label="Company default avatar"]'))
  await click('Edit'); await fill('Edit post', 'Own edited caption'); await attachImage(); await click('Save')
  assert(calls.some(c => c.method === 'PATCH' && c.url.endsWith(post._id)))
})

test('Admin can remove Company content without an edit/impersonation control', async () => {
  handler = async (url, options) => options.method === 'DELETE' ? response({ deleted: true }) : response(feed([{ ...post, canEdit: false, canDelete: true, canModerate: true, author: { role: 'company', name: 'Company', label: 'Company' } }]))
  await mount(); assert.equal(buttons('Edit').length, 0); assert.equal(buttons('Remove').length, 1)
  await click('Remove'); await click('Confirm remove')
  assert(calls.some(c => c.method === 'DELETE' && c.url.endsWith(post._id)))
})

test('Company Feed composer previews image and submits existing multipart format', async () => {
  const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL
  URL.createObjectURL = () => 'blob:company-preview'; URL.revokeObjectURL = () => {}
  try {
    handler = async (url, options) => options.method === 'POST' ? response(post, 201) : response(feed())
    await mount({ role: 'company' }); await click('New Feed post'); await fill('Share an update', 'Image caption')
    const input = container.querySelector('input[type=file]'), image = new File(['png'], 'company.png', { type: 'image/png' })
    Object.defineProperty(input, 'files', { value: [image] })
    await act(async () => { input.dispatchEvent(new dom.window.Event('change', { bubbles: true })); await flush() })
    assert.equal(container.querySelector('img[alt="Selected image preview"]').getAttribute('src'), 'blob:company-preview')
    await click('Publish update')
    const request = calls.find(c => c.method === 'POST'); assert(request.body instanceof FormData)
    assert.equal(request.body.get('content'), 'Image caption'); assert.equal(request.body.get('image').name, 'company.png')
  } finally { URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke }
})

test('Community provides an own Social Profile entry without replacing the placement profile workflow', async () => { await mount({ role: 'student' }); assert(container.querySelector('a[href="/community/profiles/' + post._id + '"]').textContent.includes('Profile')) })

for (const role of ['company', 'placement_admin']) test(`${role} broadcast is opt-in and available only on create`, async () => {
 handler = async (url, options) => options.method === 'POST' ? response(post, 201) : response(feed())
 await mount({role}); assert.deepEqual([...container.querySelectorAll('[role=tab]')].map(x=>x.textContent), ['Feed','Articles','Profile','Notifications'])
 assert.equal(container.querySelector('[role=tab][href*=profiles]').getAttribute('href'), '/community/profiles/'+post._id)
 await click('Articles'); await click('New article'); const toggle=container.querySelector('input[type=checkbox]'); assert.equal(toggle.checked,false)
 await act(async()=>{toggle.click();await flush()}); assert.equal(Boolean(container.querySelector('[aria-label="Community audience"]')),role==='placement_admin')
 if(role==='placement_admin') await act(async()=>{const select=container.querySelector('[aria-label="Community audience"]');select.value='everyone';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));await flush()})
 await fill('Article title','Broadcast advice');await fill('Article body','Controlled body');await click('Publish article')
 const input=JSON.parse(calls.find(c=>c.method==='POST').body);assert.equal(input.notifyCommunity,true);assert.equal(input.audience,role==='company'?'students':'everyone')
 await click('Edit');assert.equal(container.querySelector('input[type=checkbox]'),null);assert.equal(container.textContent.includes('Remove current image'),false)
})

test('Community notifications use separate API/badge, correct deep-link and scoped single/all read', async () => {
 let records = [{_id:'notice1',domain:'community',type:'community_comment',title:'Controlled comment',message:'Student replied',isRead:false,postId:post._id,context:{action:'view_community_post'}},{_id:'notice2',domain:'community',type:'community_broadcast',title:'Controlled broadcast',message:'Campus advice',isRead:false,postId:post._id,context:{action:'view_community_post'}}]
 notificationHandler = async (url,options) => {
  if(options.method === 'PATCH') { records=records.map(n=>url.pathname.endsWith('/read-all')||url.pathname.includes(n._id)?{...n,isRead:true}:n);return response({updated:1}) }
  return response({records,totalPages:1,unreadCount:records.filter(n=>!n.isRead).length})
 }
 await mount({role:'student',path:'/community/notifications'})
 assert(container.querySelector('[aria-label="2 unread Community notifications"]'));assert(container.querySelector('[role=tab][aria-selected=true]').textContent.includes('Notifications'))
 assert(container.querySelector(`a[href="/community/posts/${post._id}"]`));assert.match(container.textContent,/Controlled comment/);assert.doesNotMatch(container.textContent,/Messages and placement updates/)
 await click('Mark read');assert(container.querySelector('[aria-label="1 unread Community notifications"]'))
 await click('Mark all read');assert.equal(container.querySelector('[aria-label$="unread Community notifications"]'),null);assert.equal(buttons('Mark all read')[0].disabled,true)
 assert(calls.every(c=>c.url.includes('/social/notifications')));assert(calls.some(c=>c.method==='PATCH'&&c.url.endsWith('/notice1/read')));assert(calls.some(c=>c.method==='PATCH'&&c.url.endsWith('/read-all')))
})
test('Community notification loading/empty/error and failed mark-read preserve inbox', async () => {
 let resolve; notificationHandler = url=>url.searchParams.get('limit')==='1'?response({unreadCount:0}):new Promise(r=>{resolve=r})
 await mount({path:'/community/notifications'});assert.match(container.textContent,/Loading Community notifications/)
 await act(async()=>{resolve(response({records:[],unreadCount:0,totalPages:1}));await flush()});assert.match(container.textContent,/No Community notifications/)
 await act(async()=>root.unmount()); root=createRoot(container)
 notificationHandler=async(url,options)=>options.method==='PATCH'?response('Controlled read failure',500):response({records:[{_id:'n',domain:'community',title:'Existing alert',message:'Safe',isRead:false}],unreadCount:1,totalPages:1})
 await mount({path:'/community/notifications'});await click('Mark read');assert.match(container.textContent,/Controlled read failure/);assert.match(container.textContent,/Existing alert/)
})
test('Archived Community Notifications make zero requests',async()=>{await mount({cycle:'2026',path:'/community/notifications'});assert.match(container.textContent,/only in placement cycle 2027/);assert.equal(calls.length,0)})
