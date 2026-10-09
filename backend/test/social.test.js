import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { fixture, feedDependencies, A, B, C, D } from './social-fixture.js'
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/placementhub-v2-demo-2027'
process.env.JWT_SECRET = randomUUID().repeat(2)
const social = await import('../src/modules/social/social.service.js')
const { SocialPost, SocialLike, SocialComment } = await import('../src/modules/social/social.model.js')
const { postBodySchema, commentBodySchema, socialPageSchema, postParamsSchema } = await import('../src/modules/social/social.validation.js')
const { app } = await import('../src/app.js')
const { User } = await import('../src/modules/auth/auth.model.js')
const jwt = (await import('jsonwebtoken')).default
const create = (deps, content = 'Professional update', input = {}) => social.createPost(D, { content, ...input }, input.contentType === 'article' ? deps : feedDependencies(deps))

test('Admin creates Feed, server derives Official author and ignores spoofed fields', async () => {
  const deps = fixture(); const post = await create(deps, 'Feed update', { authorUserId: A._id, authorRole: A.role })
  assert.equal(deps.postModel.rows[0].authorUserId, D._id); assert.equal(deps.postModel.rows[0].authorRole, D.role)
  assert.equal(String(post.author.userId), D._id); assert.equal(post.contentType, 'feed'); assert.equal(post.author.label, 'Official'); assert.equal(post.author.name, 'Placement Administration')
  assert.equal(post.canEdit, true); assert.equal(post.image.mimeType, 'image/png')
  assert.equal((await social.getPost(A, post._id, deps)).canEdit, false)
})
test('Admin creates text-only Article with required title/body', async () => {
  const deps = fixture(); const post = await create(deps, 'Long form advice', { contentType: 'article', title: 'Interview preparation' })
  assert.equal(post.title, 'Interview preparation'); assert.equal(post.contentType, 'article'); assert.equal(post.image, null)
})
test('Students cannot create, edit or delete content', async () => {
  const deps = fixture(); const post = await create(deps)
  for (const user of [A, B]) {
    await assert.rejects(social.createPost(user, { content: 'Forbidden' }, deps), { errorCode: 'FORBIDDEN' })
    await assert.rejects(social.updatePost(user, post._id, { content: 'Forbidden' }, deps), { errorCode: 'FORBIDDEN' })
    await assert.rejects(social.deletePost(user, post._id, deps), { errorCode: 'FORBIDDEN' })
  }
})
test('type filtering excludes legacy Student content and separates Feed/Article', async () => {
  const deps = fixture(); await create(deps); await create(deps, 'Article body', { contentType: 'article', title: 'Article' })
  await deps.postModel.create({ authorUserId: A._id, authorRole: 'student', content: 'Old test post' })
  const feed = await social.listPosts(A, {}, deps); const articles = await social.listPosts(A, { contentType: 'article' }, deps)
  assert.equal(feed.records.length, 1); assert.equal(articles.records.length, 1)
  assert.equal(feed.records[0].contentType, 'feed'); assert.equal(articles.records[0].contentType, 'article')
})
test('server search matches Feed text and Article title/body, safely escapes regex', async () => {
  const deps = fixture(); await create(deps, 'Campus [update]'); await create(deps, 'Welcome')
  await create(deps, 'Practice interviews', { contentType: 'article', title: 'Resume advice' })
  assert.equal((await social.listPosts(A, { search: '[update]' }, deps)).records.length, 1)
  assert.equal((await social.listPosts(A, { search: '.*' }, deps)).records.length, 0)
  assert.equal((await social.listPosts(A, { contentType: 'article', search: 'RESUME' }, deps)).records.length, 1)
  assert.equal((await social.listPosts(A, { contentType: 'article', search: 'interviews' }, deps)).records.length, 1)
})
test('newest/oldest pagination uses stable timestamp and ID ordering, totals and empty end page', async () => {
  const deps = fixture(); for (let i = 0; i < 23; i++) await create(deps, `Post ${i}`)
  deps.postModel.rows[0].createdAt = deps.postModel.rows[1].createdAt
  for (const sort of ['newest', 'oldest']) {
    const pages = await Promise.all([1, 2, 3, 4].map(page => social.listPosts(A, { page, limit: 10, sort }, deps)))
    assert.deepEqual(pages.map(p => p.records.length), [10, 10, 3, 0]); assert.ok(pages.every(p => p.totalPages === 3 && p.totalRecords === 23))
    const all = pages.flatMap(p => p.records); assert.equal(new Set(all.map(p => p._id)).size, 23)
    for (let i = 1; i < all.length; i++) assert.ok(sort === 'newest' ? all[i - 1].createdAt >= all[i].createdAt : all[i - 1].createdAt <= all[i].createdAt)
    assert.equal(all[sort === 'newest' ? 21 : 1]._id, deps.postModel.rows[1]._id)
  }
})
test('Admin edits Feed/Article, persists content and edited indicator; type cannot change', async () => {
  const deps = fixture()
  for (const input of [{ contentType: 'feed' }, { contentType: 'article', title: 'Title' }]) {
    const p = await create(deps, 'Before', input); const after = await social.updatePost(D, p._id, { ...input, content: 'After' }, deps)
    assert.equal(after.content, 'After'); assert.equal(after.edited, true)
    assert.equal((await social.getPost(A, p._id, deps)).content, 'After')
    await assert.rejects(social.updatePost(D, p._id, { contentType: input.contentType === 'feed' ? 'article' : 'feed', title: 'Changed', content: 'X' }, deps))
  }
})
test('missing/deleted content cannot be read or engaged with', async () => {
  const deps = fixture(); const post = await create(deps); await social.deletePost(D, post._id, deps)
  for (const action of [() => social.getPost(A, post._id, deps), () => social.updatePost(D, post._id, { content: 'X' }, deps), () => social.deletePost(D, post._id, deps), () => social.toggleLike(A, post._id, true, deps), () => social.createComment(A, post._id, { content: 'X' }, deps), () => social.listComments(A, post._id, deps)]) await assert.rejects(action(), { errorCode: 'NOT_FOUND' })
})
test('all roles like/unlike idempotently; unique likes, likedByMe and counts survive reads', async () => {
  const deps = fixture(); const post = await create(deps)
  for (const user of [A, C, D]) { await social.toggleLike(user, post._id, true, deps); await social.toggleLike(user, post._id, true, deps) }
  assert.equal(deps.likeModel.rows.length, 3); assert.equal((await social.getPost(A, post._id, deps)).likedByMe, true)
  assert.equal((await social.getPost(B, post._id, deps)).likedByMe, false)
  await social.toggleLike(A, post._id, false, deps); const result = await social.toggleLike(A, post._id, false, deps)
  assert.equal(result.likeCount, 2); assert.equal(result.likedByMe, false); assert.equal(deps.notificationModel.rows.length, 0)
})
test('non-duplicate like storage errors propagate', async () => {
  const deps = fixture(); const post = await create(deps); deps.likeModel.create = async () => { throw new Error('Storage failed') }
  await assert.rejects(social.toggleLike(A, post._id, true, deps), /Storage failed/)
})
test('comments are chronological, server-authored and accurately counted on Feed and Article', async () => {
  const deps = fixture(); const p = await create(deps, 'Body', { contentType: 'article', title: 'Title' })
  await social.createComment(A, p._id, { content: 'First', authorUserId: D._id, authorRole: D.role }, deps)
  await social.createComment(C, p._id, { content: 'Second' }, deps)
  const rows = await social.listComments(A, p._id, deps)
  assert.deepEqual(rows.map(x => x.content), ['First', 'Second']); assert.deepEqual(rows.map(x => x.canDelete), [true, false])
  assert.equal(String(rows[1].author.userId), C._id); assert.equal(rows[1].author.label, 'Company'); assert.equal(deps.commentModel.rows[0].authorUserId, A._id)
  assert.equal((await social.getPost(A, p._id, deps)).commentCount, 2)
})
test('comment owner may delete; other Student/Company forbidden; Admin may moderate', async () => {
  const deps = fixture(); const p = await create(deps); const c = await social.createComment(A, p._id, { content: 'Reply' }, deps)
  for (const user of [B, C]) await assert.rejects(social.deleteComment(user, c._id, deps), { errorCode: 'FORBIDDEN' })
  await social.deleteComment(A, c._id, deps)
  const second = await social.createComment(C, p._id, { content: 'Company' }, deps)
  assert.equal((await social.listComments(D, p._id, deps))[0].canDelete, true)
  await social.deleteComment(D, second._id, deps); assert.equal((await social.getPost(A, p._id, deps)).commentCount, 0)
  await assert.rejects(social.deleteComment(A, c._id, deps), { errorCode: 'NOT_FOUND' })
})
test('post deletion cleans only related likes, comments, social notifications and image', async () => {
  const deps = fixture(); const removed = []; deps.removeImage = async image => { if (image) removed.push(image) }
  const post = await create(deps); const other = await create(deps, 'Other')
  deps.postModel.rows[0].image = { filename: 'safe.png' }
  for (const p of [post, other]) { await social.toggleLike(A, p._id, true, deps); await social.createComment(A, p._id, { content: 'Comment' }, deps) }
  await social.deletePost(D, post._id, deps)
  assert.deepEqual(deps.likeModel.rows.map(x => x.postId), [other._id]); assert.deepEqual(deps.commentModel.rows.map(x => x.postId), [other._id]); assert.deepEqual(deps.notificationModel.rows.map(x => x.postId), [other._id]); assert.equal(removed.length, 1)
})
test('Student/Company comments notify Admin with post context; self-comments/likes never notify', async () => {
  const deps = fixture(); const post = await create(deps)
  await social.createComment(D, post._id, { content: 'Self' }, deps); await social.toggleLike(A, post._id, true, deps)
  assert.equal(deps.notificationModel.rows.length, 0)
  for (const user of [A, C]) await social.createComment(user, post._id, { content: 'Reply' }, deps)
  assert.equal(deps.notificationModel.rows.length, 2)
  for (const n of deps.notificationModel.rows) { assert.equal(n.recipientId, D._id); assert.equal(n.postId, post._id); assert.deepEqual(n.context, { action: 'view_community_post', audience: 'placement_admin' }) }
})
test('Feed/Article validation, limits, IDs and filter combinations are enforced', () => {
  assert.deepEqual(postBodySchema.parse({ content: ' Hi ', authorUserId: A._id, authorRole: A.role }), { contentType: 'feed', content: 'Hi' })
  for (const content of ['', ' ', 'x'.repeat(3001)]) assert.equal(postBodySchema.safeParse({ content }).success, false)
  for (const input of [{ title: '', content: 'Body' }, { title: 'Title', content: ' ' }, { title: 'x'.repeat(181), content: 'Body' }, { title: 'Title', content: 'x'.repeat(20001) }, { title: 'Title', content: 'Body', image: '/client/path' }]) assert.equal(postBodySchema.safeParse({ contentType: 'article', ...input }).success, false)
  assert.equal(commentBodySchema.safeParse({ content: 'x'.repeat(1201) }).success, false)
  assert.equal(postParamsSchema.safeParse({ postId: '../bad' }).success, false)
  for (const input of [{ page: 0 }, { limit: 26 }, { sort: 'popular' }, { contentType: 'video' }, { search: 'x'.repeat(201) }]) assert.equal(socialPageSchema.safeParse(input).success, false)
  assert.equal(socialPageSchema.parse({ sort: 'oldest', contentType: 'article' }).sort, 'oldest')
})
test('schema retains unique likes and validates text-only Article and identities', async () => {
  assert.ok(SocialLike.schema.indexes().some(([keys, options]) => keys.postId === 1 && keys.userId === 1 && options.unique))
  await assert.rejects(new SocialPost({ authorUserId: D._id, authorRole: D.role, contentType: 'article', content: 'Body' }).validate())
  await assert.rejects(new SocialPost({ authorUserId: D._id, authorRole: D.role, contentType: 'article', title: 'Title', content: 'Body', image: { filename: 'test.png' } }).validate())
  await assert.rejects(new SocialComment({ content: 'x'.repeat(1201), authorUserId: A._id, authorRole: A.role, postId: B._id }).validate())
})
test('HTTP routes reject unauthenticated requests and Student content/image writes before parsing', async t => {
  t.mock.method(User, 'findById', id => ({ select: async () => ({ ...([A, C, D].find(x => x._id === id)), isActive: true }) }))
  const server = app.listen(0)
  try {
    const base = `http://127.0.0.1:${server.address().port}/api/v1/social`
    for (const [method, path] of [['GET', '/posts'], ['POST', '/posts'], ['PATCH', `/posts/${A._id}`], ['DELETE', `/posts/${A._id}`], ['GET', `/posts/${A._id}/image`], ['POST', `/posts/${A._id}/like`], ['POST', `/posts/${A._id}/comments`]]) assert.equal((await fetch(base + path, { method })).status, 401)
    for (const user of [A]) {
      const token = jwt.sign({ role: 'placement_admin' }, process.env.JWT_SECRET, { subject: user._id })
      for (const method of ['POST', 'PATCH', 'DELETE']) {
        const path = method === 'POST' ? '/posts' : `/posts/${D._id}`
        const response = await fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data; boundary=invalid' } })
        assert.equal(response.status, 403); assert.equal((await response.json()).errorCode, 'FORBIDDEN')
      }
    }
  } finally { await new Promise(resolve => server.close(resolve)) }
})
