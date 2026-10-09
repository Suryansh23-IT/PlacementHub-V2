import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { fixture, feedDependencies, A, B, C, D, E } from './social-fixture.js'
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/placementhub-v2-demo-2027'
process.env.JWT_SECRET = randomUUID().repeat(2)
const social = await import('../src/modules/social/social.service.js')
const notifications = await import('../src/modules/notifications/notification.service.js')
const { Notification } = await import('../src/modules/notifications/notification.model.js')
const { User } = await import('../src/modules/auth/auth.model.js')
const { app } = await import('../src/app.js')
const jwt = (await import('jsonwebtoken')).default
const article = { contentType: 'article', title: 'Controlled advice', content: 'Professional advice' }
async function mixed() {
  const deps = fixture()
  for (const input of [
    { type: 'placement_drive_published', category: 'placement_drive' },
    { type: 'admin_to_students', category: 'manual_placement_message' },
    { type: 'community_comment', category: 'community_comment' },
    { domain: 'community', type: 'community_broadcast', category: 'community' },
  ]) await deps.notificationModel.create({ recipientId: A._id, title: input.type, message: 'Controlled message', isRead: false, ...input })
  await deps.notificationModel.create({ recipientId: B._id, domain: 'community', type: 'community_comment', isRead: false })
  return deps
}
test('Placement and Community lists/counts are disjoint, including legacy Community comments', async () => {
  const deps = await mixed()
  const placement = await notifications.listNotificationPage(A._id, {}, deps)
  const community = await notifications.listNotificationPage(A._id, {}, { ...deps, domain: 'community' })
  assert.equal(placement.totalRecords, 2); assert.equal(placement.unreadCount, 2)
  assert.equal(community.totalRecords, 2); assert.equal(community.unreadCount, 2)
  assert.equal(new Set([...placement.records, ...community.records].map(x => x._id)).size, 4)
  assert((await notifications.listNotifications(A._id, deps)).every(x => !x.type.startsWith('community_')))
  const readPage = await notifications.listNotificationPage(A._id, { state: 'read' }, { ...deps, domain: 'community' })
  assert.equal(readPage.records.length, 0); assert.equal(readPage.unreadCount, 2)
})
for (const domain of ['placement', 'community']) test(`${domain} mark-one/read-all cannot touch the other domain or recipient`, async () => {
  const deps = await mixed(), scoped = { ...deps, domain }
  const own = (await notifications.listNotificationPage(A._id, {}, scoped)).records
  const foreign = (await notifications.listNotificationPage(A._id, {}, { ...deps, domain: domain === 'placement' ? 'community' : 'placement' })).records
  await assert.rejects(notifications.markStudentNotificationRead(A._id, foreign[0]._id, scoped), { statusCode: 404 })
  await assert.rejects(notifications.markStudentNotificationRead(B._id, own[0]._id, scoped), { statusCode: 404 })
  assert.equal((await notifications.markStudentNotificationRead(A._id, own[0]._id, scoped)).isRead, true)
  assert.equal((await notifications.markAllNotificationsRead(A._id, scoped)).updated, 1)
  assert.equal((await notifications.listNotificationPage(A._id, {}, scoped)).unreadCount, 0)
  assert.equal((await notifications.listNotificationPage(A._id, {}, { ...deps, domain: domain === 'placement' ? 'community' : 'placement' })).unreadCount, 2)
  assert.equal(deps.notificationModel.rows.at(-1).isRead, false)
})
for (const author of [C, D]) for (const contentType of ['feed', 'article']) test(`${author.role} ${contentType} comment alerts are Community-only; self and likes suppressed`, async () => {
  const deps = fixture(), input = contentType === 'feed' ? { contentType, content: article.content } : article
  const post = await social.createPost(author, input, contentType === 'feed' ? feedDependencies(deps) : deps)
  await social.createComment(author, post._id, { content: 'Self' }, deps)
  await social.toggleLike(A, post._id, true, deps); await social.toggleLike(A, post._id, false, deps)
  assert.equal(deps.notificationModel.rows.length, 0)
  await social.createComment(A, post._id, { content: 'Student comment' }, deps)
  const n = deps.notificationModel.rows[0]
  assert.equal(n.domain, 'community'); assert.equal(n.recipientId, author._id); assert.equal(n.postId, post._id)
  assert.equal(n.context.action, 'view_community_post')
  assert.equal((await notifications.listNotifications(author._id, deps)).length, 0)
})
for (const [audience, expected] of [['students', [A._id, B._id]], ['companies', [C._id, E._id]], ['everyone', [A._id, B._id, C._id, E._id]]]) test(`Admin create broadcast targets ${audience}, excludes self/inactive and edits do not resend`, async () => {
  const deps = fixture(); deps.userModel.rows.push({ _id: '000000000000000000000099', role: 'student', isActive: false })
  const post = await social.createPost(D, { ...article, notifyCommunity: true, audience }, deps)
  assert.deepEqual(deps.notificationModel.rows.map(x => x.recipientId).sort(), expected.sort())
  assert(deps.notificationModel.rows.every(x => x.domain === 'community' && x.type === 'community_broadcast' && x.postId === post._id && x.context.action === 'view_community_post'))
  await social.updatePost(D, post._id, { ...article, content: 'Edited' }, deps)
  assert.equal(deps.notificationModel.rows.length, expected.length)
  await assert.rejects(social.updatePost(D, post._id, { ...article, notifyCommunity: true }, deps), { statusCode: 422 })
  await social.deletePost(D, post._id, deps); assert.equal(deps.notificationModel.rows.length, 0)
})
test('Company broadcast defaults OFF and when selected targets Students only; forbidden audiences create nothing', async () => {
  const deps = fixture()
  await social.createPost(C, article, deps); assert.equal(deps.notificationModel.rows.length, 0)
  await social.createPost(C, { ...article, notifyCommunity: false, audience: 'everyone' }, deps); assert.equal(deps.notificationModel.rows.length, 0)
  for (const audience of ['companies', 'everyone']) await assert.rejects(social.createPost(C, { ...article, notifyCommunity: true, audience }, deps), { statusCode: 403 })
  assert.equal(deps.postModel.rows.length, 2)
  await assert.rejects(social.createPost(A, { ...article, notifyCommunity: true }, deps), { statusCode: 403 })
  await social.createPost(C, { ...article, notifyCommunity: true }, deps)
  assert.deepEqual(deps.notificationModel.rows.map(x => x.recipientId), [A._id, B._id])
})
test('failed broadcast recipient lookup or delivery rolls back content and new image', async () => {
  for (const stage of ['lookup', 'delivery']) {
    const deps = feedDependencies(fixture()), removed = []
    deps.removeImage = async image => removed.push(image)
    if (stage === 'lookup') deps.userModel.find = () => { throw new Error('Controlled failure') }
    else deps.notificationModel.create = async () => { throw new Error('Controlled failure') }
    await assert.rejects(social.createPost(D, { content: 'Controlled Feed', notifyCommunity: true }, deps), /Controlled failure/)
    assert.equal(deps.postModel.rows.length, 0); assert.equal(deps.notificationModel.rows.length, 0); assert.equal(removed.length, 1)
  }
})
test('authenticated HTTP Community read actions enforce domain and recipient; unauthenticated rejected', async t => {
  const deps = await mixed()
  for (const key of ['find', 'findOne', 'updateMany']) t.mock.method(Notification, key, deps.notificationModel[key])
  t.mock.method(User, 'findById', () => ({ select: async () => A }))
  const server = app.listen(0), base = `http://127.0.0.1:${server.address().port}/api/v1/social/notifications`
  const headers = { Authorization: `Bearer ${jwt.sign({}, process.env.JWT_SECRET, { subject: A._id })}` }
  try {
    assert.equal((await fetch(base)).status, 401)
    const data = (await (await fetch(base, { headers })).json()).data
    assert.equal(data.totalRecords, 2); assert.equal(data.unreadCount, 2)
    const wrong = deps.notificationModel.rows[0]._id
    assert.equal((await fetch(`${base}/${wrong}/read`, { method: 'PATCH', headers })).status, 404)
    assert.equal((await fetch(`${base}/${data.records[0]._id}/read`, { method: 'PATCH', headers })).status, 200)
    const all = await fetch(`${base}/read-all`, { method: 'PATCH', headers }); assert.equal(all.status, 200)
    assert.equal((await all.json()).data.updated, 1)
    assert.equal(deps.notificationModel.rows[0].isRead, false)
  } finally { await new Promise(resolve => server.close(resolve)) }
})
