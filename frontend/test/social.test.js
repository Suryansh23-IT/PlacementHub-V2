import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { createServer } from 'vite'
import { appendFeedPage, hasNextPage, communityAvailable, postSchema, commentSchema } from '../src/features/community/community-core.js'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
after(() => server.close())
const { PostCard, Badge } = await server.ssrLoadModule('/src/features/community/CommunityPostCard.jsx')
const { NotificationInbox } = await server.ssrLoadModule('/src/components/notifications/NotificationInbox.jsx')
const { CommunityPage } = await server.ssrLoadModule('/src/pages/CommunityPage.jsx')
const { PlacementCycleContext } = await server.ssrLoadModule('/src/features/placement-cycle/PlacementCycleContext.jsx')
const { AuthContext } = await server.ssrLoadModule('/src/features/auth/auth.context.js')
const h = React.createElement
const render = child => renderToStaticMarkup(h(MemoryRouter, null, child))
const post = { _id: '000000000000000000000001', content: 'Useful <script> professional update', contentType: 'feed', author: { name: 'Placement Administration', role: 'placement_admin', label: 'Official' }, createdAt: '2026-10-09T02:00:00Z', edited: false, canEdit: false, canModerate: false, likedByMe: false, likeCount: 3, commentCount: 2 }

test('Community is available only in current 2027', () => {
  assert.equal(communityAvailable('2027'), true)
  for (const cycle of ['2026', undefined, '2028']) assert.equal(communityAvailable(cycle), false)
})
test('post validation trims content and rejects blank and oversized updates', () => {
  assert.deepEqual(postSchema.parse({ contentType: 'feed', content: ' Hello ' }), { contentType: 'feed', content: 'Hello' })
  for (const content of ['', '  ', 'x'.repeat(3001)]) assert.equal(postSchema.safeParse({ contentType: 'feed', content }).success, false)
  assert.equal(postSchema.safeParse({ contentType: 'feed', content: 'x'.repeat(3000) }).success, true)
})
test('comment validation rejects blank and oversized comments', () => {
  for (const content of ['', ' ', 'x'.repeat(1201)]) assert.equal(commentSchema.safeParse({ content }).success, false)
  assert.equal(commentSchema.parse({ content: ' Reply ' }).content, 'Reply')
})
test('Load More appends records, deduplicates overlap and keeps newest first', () => {
  const first = { records: [{ ...post, _id: 'b', createdAt: '2026-10-09' }, { ...post, _id: 'a', createdAt: '2026-10-08' }], page: 1, totalPages: 2 }
  const next = { records: [{ ...post, _id: 'a', createdAt: '2026-10-08' }, { ...post, _id: 'c', createdAt: '2026-10-07' }], page: 2, totalPages: 2 }
  const merged = appendFeedPage(first, next)
  assert.deepEqual(merged.records.map(p => p._id), ['b', 'a', 'c']); assert.equal(merged.page, 2)
  assert.equal(first.records.length, 2)
})
test('Load More uses a stable ID tie-breaker and latest overlapping count data', () => {
  const first = { records: [{ ...post, _id: 'a' }], page: 1, totalPages: 2 }
  const result = appendFeedPage(first, { records: [{ ...post, _id: 'b' }, { ...post, _id: 'a', likeCount: 9 }], page: 2, totalPages: 2 })
  assert.deepEqual(result.records.map(p => p._id), ['b', 'a']); assert.equal(result.records[1].likeCount, 9)
})
test('Load More hides for empty/final page and appears for next page', () => {
  assert.equal(hasNextPage(null), false); assert.equal(hasNextPage({ page: 1, totalPages: 1 }), false)
  assert.equal(hasNextPage({ page: 1, totalPages: 2 }), true); assert.equal(hasNextPage({ page: 2, totalPages: 2 }), false)
})
test('post rendering escapes content and shows author, counts and Post Detail link', () => {
  const html = render(h(PostCard, { post }))
  assert.match(html, /Useful &lt;script&gt;/); assert.match(html, /Placement Administration/); assert.match(html, /Official/)
  assert.match(html, /3 likes/); assert.match(html, /2 comments/); assert.match(html, /href="\/community\/posts\/000000000000000000000001"/)
})
test('Student/Company/Official badges retain their exact identities', () => {
  for (const label of ['Student', 'Company', 'Official']) assert.match(render(h(Badge, { author: { label } })), new RegExp(label))
})
test('Admin sees edit/delete controls', () => {
  const html = render(h(PostCard, { post: { ...post, canEdit: true, canDelete: true } }))
  assert.match(html, />Edit</); assert.match(html, />Remove</)
})
test('Student and non-owner Company viewers cannot see edit/delete controls', () => {
  const html = render(h(PostCard, { post }))
  assert.doesNotMatch(html, />Edit</); assert.doesNotMatch(html, />Remove</)
})
test('Admin content controls permit edit and removal', () => {
  const html = render(h(PostCard, { post: { ...post, canEdit: true, canModerate: true } }))
  assert.match(html, />Remove</); assert.match(html, />Edit</)
})
test('likedByMe renders Unlike and edited posts show edited indicator', () => {
  const html = render(h(PostCard, { post: { ...post, likedByMe: true, edited: true } }))
  assert.match(html, /Unlike/); assert.match(html, /Edited/)
})
test('social notification shows Community sender and navigates to Post Detail', () => {
  const html = render(h(NotificationInbox, { notifications: [{ _id: 'n', type: 'community_comment', title: 'New comment', message: 'Student B commented', postId: post._id, context: { action: 'view_community_post' } }] }))
  assert.match(html, /From: Community/); assert.match(html, />View post</); assert.match(html, new RegExp(`/community/posts/${post._id}`))
})
test('placement notifications retain drive and phase journey links', () => {
  const common = { notifications: [{ _id: 'n', title: 'Drive open', placementDriveId: 'drive1', source: 'placement_system' }], driveTo: id => `/student/placement/${id}` }
  assert.match(render(h(NotificationInbox, common)), /href="\/student\/placement\/drive1"/)
  const html = render(h(NotificationInbox, { ...common, journeyTo: id => `/journey/${id}`, notifications: [{ ...common.notifications[0], applicationId: 'app1', context: { action: 'view_phase' } }] }))
  assert.match(html, /href="\/journey\/app1"/); assert.match(html, /From: System \/ Placement/)
})
function page(cycle, path = '/community') {
  return renderToStaticMarkup(h(PlacementCycleContext.Provider, { value: { cycle: { id: cycle } } }, h(AuthContext.Provider, { value: { session: { accessToken: 'test', user: { role: 'student' } } } }, h(MemoryRouter, { initialEntries: [path] }, h(Routes, null, h(Route, { path: '/community', element: h(CommunityPage) }), h(Route, { path: '/community/posts/:postId', element: h(CommunityPage) }))))))
}
test('feed initially renders loading state', () => assert.match(page('2027'), /Loading community/))
test('Post Detail initially renders post loading state', () => assert.match(page('2027', `/community/posts/${post._id}`), /Loading community post/))
test('2026 direct Community access displays restriction without mounting data page', () => {
  const html = page('2026'); assert.match(html, /available only in placement cycle 2027/); assert.doesNotMatch(html, /Publish update|Loading community/)
})
