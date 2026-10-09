import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { randomUUID } from 'node:crypto'
import { fixture, A, C, D, E } from './social-fixture.js'
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/placementhub-v2-demo-2027'
process.env.JWT_SECRET = randomUUID().repeat(2)
process.env.SOCIAL_IMAGE_MAX_BYTES = '1024'
const directory = await mkdtemp(path.join(os.tmpdir(), 'placementhub-social-http-'))
process.env.SOCIAL_UPLOAD_DIR = directory
const { SocialProfile } = await import('../src/modules/social/social-profile.model.js')
const { app } = await import('../src/app.js')
const { User } = await import('../src/modules/auth/auth.model.js')
const { StudentProfile } = await import('../src/modules/students/student.model.js')
const { Company } = await import('../src/modules/companies/company.model.js')
const { Notification } = await import('../src/modules/notifications/notification.model.js')
const { SocialPost, SocialLike, SocialComment } = await import('../src/modules/social/social.model.js')
const jwt = (await import('jsonwebtoken')).default
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM1sAAAAASUVORK5CYII=', 'base64')
test('HTTP multipart Admin image lifecycle, Article rejection, size/MIME checks and reader RBAC', async t => {
  const deps = fixture()
  for (const [model, fake] of [[SocialProfile, deps.socialProfileModel], [SocialPost, deps.postModel], [SocialLike, deps.likeModel], [SocialComment, deps.commentModel], [Notification, deps.notificationModel], [User, deps.userModel], [StudentProfile, deps.profileModel], [Company, deps.companyModel]]) {
    for (const key of ['find', 'findOne', 'countDocuments', 'exists', 'create', 'deleteOne', 'deleteMany']) if (typeof model[key] === 'function' && fake[key]) t.mock.method(model, key, fake[key])
  }
  t.mock.method(User, 'findById', id => ({ select: async () => ({ ...[A, C, D, E].find(x => x._id === id), isActive: true }) }))
  const server = app.listen(0)
  const base = `http://127.0.0.1:${server.address().port}/api/v1/social`
  const token = user => jwt.sign({ role: user.role }, process.env.JWT_SECRET, { subject: user._id })
  async function request(user, method, endpoint, body, status = 200) {
    const response = await fetch(base + endpoint, { method, headers: { Authorization: `Bearer ${token(user)}`, ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}) })
    assert.equal(response.status, status, `${method} ${endpoint}`)
    return response
  }
  function form(type = 'feed', bytes = png, mime = 'image/png') {
    const body = new FormData(); body.append('contentType', type); body.append('content', 'Image caption')
    if (type === 'article') body.append('title', 'Article title')
    body.append('image', new Blob([bytes], { type: mime }), '../../client-file.png'); return body
  }
  try {
    await request(D, 'POST', '/posts', { content: 'Missing image' }, 422)
    await request(C, 'POST', '/posts', { content: 'Missing image' }, 422)
    const duplicate = form(); duplicate.append('image', new Blob([png], { type: 'image/png' }), 'second.png'); await request(D, 'POST', '/posts', duplicate, 422)
    const post = (await (await request(D, 'POST', '/posts', form(), 201)).json()).data
    assert.equal(post.image.mimeType, 'image/png'); assert.equal(post.image.filename, undefined); assert.ok(!JSON.stringify(post).includes(directory))
    const image = await request(A, 'GET', `/posts/${post._id}/image`)
    assert.equal(image.headers.get('content-type'), 'image/png'); assert.equal(image.headers.get('x-content-type-options'), 'nosniff')
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), png)
    assert.equal((await fetch(`${base}/posts/${post._id}/image`)).status, 401)
    const originalFiles = await readdir(directory)
    await request(A, 'POST', '/posts', form(), 403)
    for (const user of [A, C]) { await request(user, 'PATCH', `/posts/${post._id}`, form(), 403); await request(user, 'DELETE', `/posts/${post._id}`, undefined, 403) }
    await request(D, 'POST', '/posts', form('article'), 422)
    await request(D, 'POST', '/posts', form('feed', Buffer.from('<svg></svg>'), 'image/svg+xml'), 422)
    await request(D, 'POST', '/posts', form('feed', Buffer.from('not a PNG')), 422)
    const oversized = await request(D, 'POST', '/posts', form('feed', Buffer.alloc(2048)), 422)
    assert.match((await oversized.json()).message, /Community images/)
    assert.deepEqual(await readdir(directory), originalFiles)
    await request(D, 'PATCH', `/posts/${post._id}`, { content: 'Edit keeps image' }); assert.deepEqual(await readdir(directory), originalFiles)
    await request(D, 'PATCH', `/posts/${post._id}`, form()); assert.equal((await readdir(directory)).length, 1); assert.notDeepEqual(await readdir(directory), originalFiles)
    await request(D, 'PATCH', `/posts/${post._id}`, { content: 'Remove image', removeImage: true }, 422); assert.equal((await readdir(directory)).length, 1)
    await request(A, 'GET', `/posts/${post._id}/image`)
    await request(D, 'PATCH', `/posts/${post._id}`, form()); await request(D, 'DELETE', `/posts/${post._id}`); assert.deepEqual(await readdir(directory), [])
    const companyPost = (await (await request(C, 'POST', '/posts', form(), 201)).json()).data
    assert.equal(companyPost.author.userId, C._id); assert.equal(companyPost.author.name, 'Test Company'); assert.equal(companyPost.canEdit, true); assert.equal(companyPost.canDelete, true)
    assert.deepEqual(Buffer.from(await (await request(A, 'GET', `/posts/${companyPost._id}/image`)).arrayBuffer()), png)
    const companyFiles = await readdir(directory)
    for (const user of [A, E, D]) { await request(user, 'PATCH', `/posts/${companyPost._id}`, form(), 403) }
    await request(E, 'PATCH', `/posts/${companyPost._id}`, { content: 'Cannot remove image', removeImage: true }, 403)
    await request(E, 'DELETE', `/posts/${companyPost._id}`, undefined, 403)
    assert.deepEqual(await readdir(directory), companyFiles)
    await request(C, 'POST', '/posts', form('article'), 422)
    await request(C, 'PATCH', `/posts/${companyPost._id}`, { content: 'Keep own image' }); assert.deepEqual(await readdir(directory), companyFiles)
    await request(C, 'PATCH', `/posts/${companyPost._id}`, form()); assert.equal((await readdir(directory)).length, 1); assert.notDeepEqual(await readdir(directory), companyFiles)
    await request(C, 'PATCH', `/posts/${companyPost._id}`, { content: 'Remove own image', removeImage: true }, 422); assert.equal((await readdir(directory)).length, 1)
    await request(C, 'PATCH', `/posts/${companyPost._id}`, form()); await request(C, 'DELETE', `/posts/${companyPost._id}`); assert.deepEqual(await readdir(directory), [])
    const moderated = (await (await request(C, 'POST', '/posts', form(), 201)).json()).data
    await request(D, 'DELETE', `/posts/${moderated._id}`); assert.deepEqual(await readdir(directory), [])
  } finally {
    await new Promise(resolve => server.close(resolve))
    assert.ok(path.basename(directory).startsWith('placementhub-social-http-')); await rm(directory, { recursive: true, force: true })
  }
})
