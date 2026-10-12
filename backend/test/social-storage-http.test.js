import test from 'node:test'
import assert from 'node:assert/strict'
import { StorageClient } from '@supabase/storage-js'
import { fixture, A, B, C, D, E } from './social-fixture.js'
process.env.NODE_ENV = 'production'
process.env.MONGO_URI = 'mongodb://localhost/placementhub-v2-demo-2027'
process.env.JWT_SECRET = 'synthetic-social-storage-http-secret-long-enough'
process.env.AI_ENABLED = 'false'
process.env.STORAGE_PROVIDER = 'supabase'
process.env.SUPABASE_STORAGE_BUCKET = 'placementhub-2027'
process.env.SUPABASE_URL = 'https://synthetic-project.supabase.co'
process.env.SUPABASE_SECRET_KEY = ['sb', 'secret', 'synthetic_social_http_fixture'].join('_')
process.env.SOCIAL_IMAGE_MAX_BYTES = '1024'
const { app } = await import('../src/app.js')
const { env } = await import('../src/config/env.js')
const { User } = await import('../src/modules/auth/auth.model.js')
const { StudentProfile } = await import('../src/modules/students/student.model.js')
const { Company } = await import('../src/modules/companies/company.model.js')
const { InstitutionProfile } = await import('../src/modules/institution/institution.model.js')
const { Notification } = await import('../src/modules/notifications/notification.model.js')
const { SocialPost, SocialLike, SocialComment } = await import('../src/modules/social/social.model.js')
const { SocialProfile } = await import('../src/modules/social/social-profile.model.js')
const { default: jwt } = await import('jsonwebtoken')
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM1sAAAAASUVORK5CYII=', 'base64')
const safe = value => assert.doesNotMatch(JSON.stringify(value), /storageReference|storagePath|"provider"|"key"|"filename"|supabase\.co|2027\/(feed-image|profile-avatar)/)

test('production Feed/avatar HTTP preserves multipart, authorization, private headers, reads and cleanup', async t => {
  const deps = fixture(); const objects = new Map(); let calls = 0; let failCreate = false; let failAvatarSave = false; let failCleanup = false
  t.mock.method(console, 'error', () => {}); t.mock.method(console, 'warn', () => {})
  t.mock.method(StorageClient.prototype, 'getBucket', async () => { calls++; return { data: { id: 'placementhub-2027', public: false } } })
  t.mock.method(StorageClient.prototype, 'from', () => ({
    async upload(key, buffer, options) { calls++; assert.equal(options.upsert, false); objects.set(key, buffer); return { error: null } },
    async download(key) { calls++; return objects.has(key) ? { data: new Blob([objects.get(key)]) } : { error: { statusCode: 404 } } },
    async remove(keys) { calls++; if (failCleanup) return { error: { statusCode: 500, message: 'Private cloud failure' } }; keys.forEach(key => objects.delete(key)); return { error: null } },
  }))
  const originalFetch = globalThis.fetch
  t.mock.method(globalThis, 'fetch', (url, options) => { assert.ok(String(url).startsWith('http://127.0.0.1:'), 'External network forbidden'); return originalFetch(url, options) })
  for (const [model, fake] of [[SocialProfile, deps.socialProfileModel], [SocialPost, deps.postModel], [SocialLike, deps.likeModel], [SocialComment, deps.commentModel], [Notification, deps.notificationModel], [User, deps.userModel], [StudentProfile, deps.profileModel], [Company, deps.companyModel]]) {
    for (const key of ['find', 'findOne', 'countDocuments', 'exists', 'create', 'deleteOne', 'deleteMany']) if (fake[key]) t.mock.method(model, key, fake[key])
  }
  const users = [A, B, C, D, E]
  const read = value => ({ select: () => ({ lean: async () => structuredClone(value) }) })
  t.mock.method(User, 'findById', id => ({ select: async () => users.find(user => user._id === id) }))
  t.mock.method(User, 'findOne', filter => read(users.find(user => user._id === filter._id) ?? null))
  t.mock.method(StudentProfile, 'findOne', () => read({ branch: 'IT', skills: [] }))
  t.mock.method(Company, 'findOne', () => read({ companyName: 'Company' }))
  t.mock.method(InstitutionProfile, 'findOne', () => read({ collegeName: 'College' }))
  for (const model of [User, StudentProfile, Company, InstitutionProfile]) for (const method of ['findOneAndUpdate', 'updateOne']) t.mock.method(model, method, () => { throw new Error('Source data must remain unchanged') })
  t.mock.method(SocialProfile, 'findOne', filter => read(deps.socialProfileModel.rows.find(row => row.userId === filter.userId) ?? null))
  t.mock.method(SocialProfile, 'findOneAndUpdate', async (filter, update) => {
    if (failAvatarSave) throw new Error('Avatar DB failure')
    let row = deps.socialProfileModel.rows.find(row => row.userId === filter.userId)
    if (!row) { row = { userId: filter.userId }; deps.socialProfileModel.rows.push(row) }
    // Use real schema validation for the metadata that production MongoDB receives.
    const next = { ...row, ...update.$set }; for (const key of Object.keys(update.$unset ?? {})) delete next[key]
    await new SocialProfile(next).validate()
    Object.assign(row, structuredClone(update.$set), { updatedAt: new Date() }); for (const key of Object.keys(update.$unset ?? {})) delete row[key]
    return row
  })
  t.mock.method(SocialPost, 'create', async input => {
    if (failCreate) throw new Error('Post DB failure')
    await new SocialPost(input).validate(); return deps.postModel.create(input)
  })
  const server = app.listen(0); t.after(() => new Promise(resolve => server.close(resolve)))
  const base = `http://127.0.0.1:${server.address().port}/api/v1/social`
  const headers = user => user ? { Authorization: `Bearer ${jwt.sign({}, env.JWT_SECRET, { subject: user._id })}` } : {}
  async function request(user, method, endpoint, body, status = 200) {
    const response = await fetch(base + endpoint, { method, headers: { ...headers(user), ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}) })
    assert.equal(response.status, status, `${method} ${endpoint}`)
    if (!endpoint.endsWith('/image') && !endpoint.endsWith('/avatar')) { const result = await response.json(); safe(result); return result.data }
    return response
  }
  const form = (profile = false, bytes = png, mime = 'image/png', field = 'image') => {
    const body = new FormData(); body.append(profile ? 'bio' : 'content', 'Image caption'); body.append(field, new Blob([bytes], { type: mime }), '../../client.png'); return body
  }
  const imageRead = async (user, endpoint) => {
    const response = await request(user, 'GET', endpoint)
    assert.equal(response.headers.get('content-type'), 'image/png'); assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(response.headers.get('cache-control'), 'private, no-store'); assert.equal(response.headers.get('location'), null)
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), png)
  }
  const denied = async (user, method, endpoint, body, status) => {
    const before = calls; await request(user, method, endpoint, body, status); assert.equal(calls, before)
  }
  await denied(undefined, 'POST', '/posts', form(), 401); await denied(A, 'POST', '/posts', form(), 403)
  for (const input of [form(false, png, 'image/svg+xml'), form(false, Buffer.from('invalid')), form(false, Buffer.alloc(2048)), form(false, png, 'image/png', 'wrong')]) await denied(C, 'POST', '/posts', input, 422)
  failCreate = true; await request(C, 'POST', '/posts', form(), 500); assert.equal(objects.size, 0); failCreate = false
  const post = await request(C, 'POST', '/posts', form(), 201); assert.deepEqual(post.image, { mimeType: 'image/png', size: png.length })
  const row = deps.postModel.rows[0]; const first = row.image
  assert.equal(first.filename, undefined); assert.equal(first.storageReference.provider, 'supabase')
  for (const actor of users) await imageRead(actor, `/posts/${post._id}/image`)
  await denied(undefined, 'GET', `/posts/${post._id}/image`, undefined, 401)
  for (const actor of [A, E, D]) await denied(actor, 'PATCH', `/posts/${post._id}`, form(), 403)
  for (const actor of [A, E]) await denied(actor, 'DELETE', `/posts/${post._id}`, undefined, 403)
  const save = row.save; row.save = async () => { throw new Error('Post save failure') }
  const beforeFail = [...objects.keys()].sort(); await request(C, 'PATCH', `/posts/${post._id}`, form(), 500)
  assert.deepEqual(row.image, first); assert.deepEqual([...objects.keys()].sort(), beforeFail); row.save = save
  await request(C, 'PATCH', `/posts/${post._id}`, form()); assert.equal(objects.has(first.storageReference.key), false)
  failCleanup = true; await request(C, 'PATCH', `/posts/${post._id}`, form()); await imageRead(A, `/posts/${post._id}/image`); failCleanup = false
  await denied(C, 'PATCH', `/posts/${post._id}`, { content: 'Cannot remove', removeImage: true }, 422)
  const committed = row.image; await request(D, 'DELETE', `/posts/${post._id}`); assert.equal(objects.has(committed.storageReference.key), false)
  await denied(A, 'GET', `/posts/${post._id}/image`, undefined, 404)
  const official = await request(D, 'POST', '/posts', form(), 201)
  await request(D, 'PATCH', `/posts/${official._id}`, form()); await request(D, 'DELETE', `/posts/${official._id}`)
  for (const owner of [A, C]) {
    const endpoint = `/profiles/${owner._id}`
    await denied(undefined, 'PATCH', endpoint, form(true), 401); await denied(B, 'PATCH', endpoint, form(true), 403)
    for (const input of [form(true, png, 'image/svg+xml'), form(true, Buffer.from('invalid')), form(true, Buffer.alloc(2048)), form(true, png, 'image/png', 'wrong')]) await denied(owner, 'PATCH', endpoint, input, 422)
    const uploaded = await request(owner, 'PATCH', endpoint, form(true)); assert.equal(uploaded.hasAvatar, true)
    const saved = deps.socialProfileModel.rows.find(item => item.userId === owner._id); const previous = saved.avatar
    assert.equal(previous.filename, undefined); assert.ok(previous.storageReference.key.startsWith('2027/profile-avatar/'))
    for (const viewer of users) { const profile = await request(viewer, 'GET', endpoint); assert.equal(profile.hasAvatar, true); await imageRead(viewer, `${endpoint}/avatar`) }
    await denied(undefined, 'GET', `${endpoint}/avatar`, undefined, 401)
    failAvatarSave = true; const before = [...objects.keys()].sort()
    await request(owner, 'PATCH', endpoint, form(true), 500); await request(owner, 'PATCH', endpoint, { removeImage: true }, 500)
    assert.deepEqual(saved.avatar, previous); assert.deepEqual([...objects.keys()].sort(), before); failAvatarSave = false
    await request(D, 'PATCH', endpoint, form(true)); assert.equal(objects.has(previous.storageReference.key), false)
    const replaced = saved.avatar; failCleanup = true; const removed = await request(owner, 'PATCH', endpoint, { removeImage: true }); failCleanup = false
    assert.equal(removed.hasAvatar, false); assert.equal(saved.avatar, undefined); assert.equal(objects.has(replaced.storageReference.key), true)
    await denied(A, 'GET', `${endpoint}/avatar`, undefined, 404)
  }
  await denied(D, 'PATCH', `/profiles/${D._id}`, form(true), 422)
  await denied(D, 'PATCH', `/profiles/${D._id}`, { removeImage: true }, 422)
  await denied(A, 'GET', `/profiles/${D._id}/avatar`, undefined, 404)
  // Legacy metadata is recognized for DTOs, but production refuses local file access.
  const legacy = { filename: '00000000-0000-0000-0000-000000000000.png', mimeType: 'image/png', size: png.length }
  const legacyPost = await deps.postModel.create({ authorUserId: C._id, authorRole: C.role, content: 'Legacy', image: legacy })
  const saved = deps.socialProfileModel.rows.find(item => item.userId === A._id); saved.avatar = legacy
  await denied(A, 'GET', `/posts/${legacyPost._id}/image`, undefined, 503); await denied(A, 'GET', `/profiles/${A._id}/avatar`, undefined, 503)
  const legacyDto = await request(A, 'GET', `/posts/${legacyPost._id}`); assert.ok(legacyDto.image)
  assert.equal((await request(A, 'GET', `/profiles/${A._id}`)).hasAvatar, true)
  // Feed author avatars also recognize cloud references without exposing them.
  await request(A, 'PATCH', `/profiles/${A._id}`, form(true)); await request(C, 'PATCH', `/profiles/${C._id}`, form(true))
  const last = await request(C, 'POST', '/posts', form(), 201); assert.equal(last.author.hasAvatar, true)
  await request(A, 'POST', `/posts/${last._id}/comments`, { content: 'Comment' }, 201)
  const comments = await request(C, 'GET', `/posts/${last._id}/comments`); assert.equal(comments[0].author.hasAvatar, true)
})
