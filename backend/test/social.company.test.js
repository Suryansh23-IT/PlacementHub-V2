import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { fixture, feedDependencies, A, C, D, E } from './social-fixture.js'
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/placementhub-v2-demo-2027'
process.env.JWT_SECRET = randomUUID().repeat(2)
const social = await import('../src/modules/social/social.service.js')
const { SocialPost, SocialLike, SocialComment } = await import('../src/modules/social/social.model.js')
const { User } = await import('../src/modules/auth/auth.model.js')
const { StudentProfile } = await import('../src/modules/students/student.model.js')
const { Company } = await import('../src/modules/companies/company.model.js')
const { Notification } = await import('../src/modules/notifications/notification.model.js')
const { SocialProfile } = await import('../src/modules/social/social-profile.model.js')
const { app } = await import('../src/app.js')
const jwt = (await import('jsonwebtoken')).default
const create = (user, input, deps) => social.createPost(user, input, input.contentType === 'article' ? deps : feedDependencies(deps))

for (const contentType of ['feed', 'article']) test(`Company owns ${contentType} create/detail/edit/delete; others cannot mutate`, async () => {
  const deps = fixture(), input = { contentType, ...(contentType === 'article' ? { title: 'Company article' } : {}), content: 'Company update', authorUserId: D._id, authorRole: D.role }
  const post = await create(C, input, deps)
  assert.equal(deps.postModel.rows[0].authorUserId, C._id); assert.equal(deps.postModel.rows[0].authorRole, 'company')
  assert.deepEqual(post.author, { userId: C._id, name: 'Test Company', role: 'company', label: 'Company', hasAvatar: false, avatarVersion: undefined })
  assert.equal(post.canEdit, true); assert.equal(post.canDelete, true)
  for (const user of [A, E]) {
    const view = await social.getPost(user, post._id, deps); assert.equal(view.canEdit, false); assert.equal(view.canDelete, false)
    await assert.rejects(social.updatePost(user, post._id, input, deps), { statusCode: 403 })
    await assert.rejects(social.deletePost(user, post._id, deps), { statusCode: 403 })
  }
  const updated = await social.updatePost(C, post._id, { ...input, content: 'Edited own content', ...(contentType === 'article' ? { title: 'Edited title' } : {}) }, deps)
  assert.equal(updated.content, 'Edited own content'); assert.equal(updated.edited, true)
  assert.equal(deps.postModel.rows[0].authorUserId, C._id)
  if (contentType === 'article') assert.equal(updated.title, 'Edited title')
  await social.toggleLike(A, post._id, true, deps); await social.toggleLike(A, post._id, true, deps)
  await social.createComment(A, post._id, { content: 'Student reply' }, deps)
  assert.equal((await social.getPost(A, post._id, deps)).likeCount, 1)
  assert.equal((await social.listComments(C, post._id, deps)).length, 1)
  assert.equal(deps.notificationModel.rows[0].recipientId, C._id)
  await social.deletePost(C, post._id, deps)
  for (const model of [deps.postModel, deps.likeModel, deps.commentModel, deps.notificationModel]) assert.equal(model.rows.length, 0)
})

test('Admin moderates Company content/comments without editing or impersonating the author', async () => {
  const deps = fixture(), post = await create(C, { content: 'Company post' }, deps)
  const view = await social.getPost(D, post._id, deps)
  assert.equal(view.canEdit, false); assert.equal(view.canDelete, true); assert.equal(view.canModerate, true)
  await assert.rejects(social.updatePost(D, post._id, { content: 'Impersonated edit' }, deps), { statusCode: 403 })
  const comment = await social.createComment(A, post._id, { content: 'Controlled reply' }, deps)
  await social.deleteComment(D, comment._id, deps); await social.deletePost(D, post._id, deps)
  assert.equal(deps.postModel.rows.length, 0)
})

test('Company cannot modify Admin content and model excludes Student authors', async () => {
  const deps = fixture(), post = await create(D, { content: 'Official update' }, deps)
  for (const user of [C, E]) {
    await assert.rejects(social.updatePost(user, post._id, { content: 'Forbidden' }, deps), { statusCode: 403 })
    await assert.rejects(social.deletePost(user, post._id, deps), { statusCode: 403 })
  }
  const legacy = await deps.postModel.create({ authorUserId: C._id, authorRole: 'placement_admin', content: 'Historical role must not grant Company access' })
  await assert.rejects(social.updatePost(C, legacy._id, { content: 'Forbidden' }, deps), { statusCode: 403 })
  await assert.rejects(social.deletePost(C, legacy._id, deps), { statusCode: 403 })
  await new SocialPost({ authorUserId: C._id, authorRole: 'company', content: 'Allowed', image: { filename: 'safe.png', mimeType: 'image/png', size: 5 } }).validate()
  await assert.rejects(new SocialPost({ authorUserId: A._id, authorRole: 'student', content: 'Forbidden' }).validate())
})

test('mixed Admin/Company Feed and Articles retain search, sort, pagination and safe identities', async () => {
  const deps = fixture()
  for (let i = 0; i < 7; i++) for (const contentType of ['feed', 'article']) await create(i % 2 ? C : D, { contentType, content: `Shared campus update ${i}`, ...(contentType === 'article' ? { title: `Campus advice ${i}` } : {}) }, deps)
  for (const contentType of ['feed', 'article']) for (const sort of ['newest', 'oldest']) {
    const pages = await Promise.all([1, 2, 3].map(page => social.listPosts(A, { contentType, sort, search: 'campus', page, limit: 3 }, deps)))
    assert.deepEqual(pages.map(p => p.records.length), [3, 3, 1]); assert.equal(pages[0].totalRecords, 7)
    const rows = pages.flatMap(p => p.records); assert.equal(new Set(rows.map(p => p._id)).size, 7)
    assert.deepEqual(new Set(rows.map(p => p.author.role)), new Set(['placement_admin', 'company']))
    assert(rows.every(p => p.author.userId && !p.author.email && !p.canEdit && !p.canDelete))
    for (let i = 1; i < rows.length; i++) assert(sort === 'newest' ? rows[i - 1].createdAt >= rows[i].createdAt : rows[i - 1].createdAt <= rows[i].createdAt)
  }
})

test('Community author identity reuses saved Company social name and Student/Company avatar without leaking metadata', async () => {
  const deps = fixture()
  deps.socialProfileModel.rows.push({ userId: C._id, companyName: 'Community Company', avatar: { filename: 'private-stored.png', mimeType: 'image/png' }, updatedAt: new Date() }, { userId: A._id, avatar: { filename: 'student-private.png' }, updatedAt: new Date() })
  const post = await create(C, { content: 'Community identity' }, deps)
  assert.equal(post.author.name, 'Community Company'); assert.equal(post.author.hasAvatar, true); assert.equal(post.author.userId, C._id)
  const comment = await social.createComment(A, post._id, { content: 'Creative Student identity' }, deps)
  assert.equal(comment.author.hasAvatar, true); assert.equal(comment.author.userId, A._id)
  assert(!JSON.stringify([post.author, comment.author]).includes('private'))
})

test('HTTP ownership enforced for Company, foreign Company, Admin and Student, before image parsing', async t => {
  const deps = fixture()
  for (const [model, fake] of [[SocialProfile, deps.socialProfileModel], [SocialPost, deps.postModel], [SocialLike, deps.likeModel], [SocialComment, deps.commentModel], [Notification, deps.notificationModel], [User, deps.userModel], [StudentProfile, deps.profileModel], [Company, deps.companyModel]]) {
    for (const key of ['find', 'findOne', 'countDocuments', 'exists', 'create', 'deleteOne', 'deleteMany']) if (typeof model[key] === 'function' && fake[key]) t.mock.method(model, key, fake[key])
  }
  t.mock.method(User, 'findById', id => ({ select: async () => ({ ...[A, C, D, E].find(x => x._id === id), isActive: true }) }))
  const server = app.listen(0), base = `http://127.0.0.1:${server.address().port}/api/v1/social/posts`
  async function request(user, method, endpoint, input, expected) {
    const headers = { Authorization: `Bearer ${jwt.sign({ role: 'placement_admin' }, process.env.JWT_SECRET, { subject: user._id })}`, 'Content-Type': input === 'bad-image' ? 'multipart/form-data; boundary=invalid' : 'application/json' }
    const r = await fetch(base + endpoint, { method, headers, ...(input ? { body: input === 'bad-image' ? 'invalid' : JSON.stringify(input) } : {}) })
    assert.equal(r.status, expected, `${user.role} ${method} ${endpoint}`); return (await r.json()).data
  }
  try {
    const official = await request(D, 'POST', '', { contentType: 'article', title: 'Official', content: 'Official' }, 201)
    for (const contentType of ['article']) {
      const input = { contentType, content: 'Company HTTP content', ...(contentType === 'article' ? { title: 'Article title' } : {}), authorUserId: D._id, authorRole: D.role }
      const own = await request(C, 'POST', '', input, 201); assert.equal(own.author.userId, C._id)
      for (const user of [A, E]) {
        await request(user, 'PATCH', `/${own._id}`, input, 403)
        await request(user, 'PATCH', `/${own._id}`, 'bad-image', 403)
        await request(user, 'DELETE', `/${own._id}`, null, 403)
      }
      await request(D, 'PATCH', `/${own._id}`, input, 403)
      await request(C, 'PATCH', `/${own._id}`, { ...input, content: 'Edited' }, 200)
      await request(C, 'DELETE', `/${own._id}`, null, 200)
    }
    for (const method of ['PATCH', 'DELETE']) await request(C, method, `/${official._id}`, method === 'PATCH' ? { content: 'Forbidden' } : null, 403)
    await request(A, 'POST', '', { content: 'Forbidden' }, 403)
    const moderated = await request(C, 'POST', '', { contentType: 'article', title: 'Controlled article', content: 'Moderated Company post' }, 201)
    await request(D, 'DELETE', `/${moderated._id}`, null, 200)
  } finally { await new Promise(resolve => server.close(resolve)) }
})
