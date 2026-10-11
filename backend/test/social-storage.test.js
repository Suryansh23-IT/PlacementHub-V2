import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink } from 'node:fs/promises'
import { fixture, A, B, C, D, E } from './social-fixture.js'
process.env.MONGO_URI = 'mongodb://localhost/placementhub-v2-test'
process.env.JWT_SECRET = 'synthetic-social-storage-secret-long-enough'
const { createImageStorage } = await import('../src/modules/social/social.media.js')
const { createPost, updatePost, deletePost, getPostImage, getPost } = await import('../src/modules/social/social.service.js')
const { updateSocialProfile, getProfileAvatar, getSocialProfile } = await import('../src/modules/social/social-profile.service.js')
const { SocialPost } = await import('../src/modules/social/social.model.js')
const { SocialProfile } = await import('../src/modules/social/social-profile.model.js')
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM1sAAAAASUVORK5CYII=', 'base64')
const file = { originalname: '../../client.png', mimetype: 'image/png', buffer: png }
const cloudConfig = { NODE_ENV: 'production', STORAGE_PROVIDER: 'supabase', SUPABASE_STORAGE_BUCKET: 'placementhub-2027', MONGO_URI: 'mongodb://localhost/placementhub-v2-demo-2027', SUPABASE_URL: 'https://synthetic-project.supabase.co', SUPABASE_SECRET_KEY: ['sb', 'secret', 'synthetic_social_storage_fixture'].join('_') }
const safe = value => assert.doesNotMatch(JSON.stringify(value), /storageReference|storagePath|"provider"|"key"|"filename"|supabase\.co|2027\/(feed-image|profile-avatar)/)
async function storageFixture(t, category, provider) {
  const directory = await mkdtemp(path.join(tmpdir(), 'placementhub-e3-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const objects = new Map(); const events = []
  const client = {
    getBucket: async () => ({ data: { id: 'placementhub-2027', public: false } }),
    from: () => ({
      async upload(key, buffer) { events.push('store'); objects.set(key, buffer); return { error: null } },
      async download(key) { events.push('read'); return objects.has(key) ? { data: new Blob([objects.get(key)]) } : { error: { statusCode: 404 } } },
      async remove(keys) { events.push('remove'); keys.forEach(key => objects.delete(key)); return { error: null } },
    }),
  }
  const config = provider === 'local' ? { NODE_ENV: 'test', SOCIAL_UPLOAD_DIR: directory } : cloudConfig
  const storage = createImageStorage(config, category, provider === 'local' ? {} : { client })
  return { directory, config, storage, objects, events, client }
}
function feed(storage) {
  return { ...fixture(), imageFile: file, storeImage: storage.store, removeImage: storage.remove, readImage: storage.read, onCleanupFailure: () => {} }
}
function avatar(storage) {
  const saved = []; const events = []; let failSave = false
  const read = value => ({ select: () => ({ lean: async () => structuredClone(value) }) })
  const deps = {
    imageFile: file, storeAvatar: storage.store, removeAvatar: storage.remove, readAvatar: storage.read, onCleanupFailure: () => events.push('cleanup-failed'),
    userModel: { findOne: filter => read([A, B, C, D, E].find(user => user._id === filter._id) ?? null) },
    profileModel: { findOne: () => read({ branch: 'IT', skills: [] }) },
    companyModel: { findOne: () => read({ companyName: 'Company' }) },
    institutionModel: { findOne: () => read({ collegeName: 'College' }) },
    socialProfileModel: {
      findOne: filter => read(saved.find(row => row.userId === filter.userId) ?? null),
      async findOneAndUpdate(filter, update) {
        events.push('save'); if (failSave) throw new Error('Avatar DB failure')
        let row = saved.find(row => row.userId === filter.userId)
        if (!row) { row = { userId: filter.userId }; saved.push(row) }
        Object.assign(row, structuredClone(update.$set), { updatedAt: new Date() })
        for (const key of Object.keys(update.$unset ?? {})) delete row[key]
        return row
      },
    },
  }
  return { deps, saved, events, fail: value => { failSave = value } }
}

for (const provider of ['local', 'supabase']) {
  test(`${provider}: Feed create/read/replace/delete, privacy and failed-save cleanup`, async t => {
    const f = await storageFixture(t, 'feed-image', provider); const deps = feed(f.storage)
    const created = await createPost(C, { content: 'Caption' }, deps); safe(created)
    const post = deps.postModel.rows[0]; const first = post.image
    assert.equal(first.storageReference.provider, provider); assert.equal(Boolean(first.filename), provider === 'local')
    assert.deepEqual((await getPostImage(created._id, deps)).buffer, png)
    await updatePost(C, created._id, { content: 'Replacement' }, deps); safe(await getPost(A, created._id, deps))
    await assert.rejects(f.storage.read(first), { statusCode: 404 })
    const committed = post.image
    post.save = async () => { throw new Error('Feed DB failure') }
    await assert.rejects(updatePost(C, created._id, { content: 'Fails' }, deps), /Feed DB failure/)
    assert.deepEqual(post.image, committed); assert.equal(post.content, 'Replacement')
    assert.deepEqual(await f.storage.read(committed), png)
    assert.equal(provider === 'local' ? (await readdir(f.directory)).length : f.objects.size, 1)
    await assert.rejects(createPost(C, { content: 'Fails' }, { ...deps, postModel: { create: async () => { throw new Error('Create DB failure') } } }), /Create DB failure/)
    assert.equal(provider === 'local' ? (await readdir(f.directory)).length : f.objects.size, 1)
    await deletePost(D, created._id, deps)
    assert.equal(deps.postModel.rows.length, 0); await assert.rejects(f.storage.read(committed), { statusCode: 404 })
    assert.equal(provider === 'local' ? (await readdir(f.directory)).length : f.objects.size, 0)
  })

  for (const owner of [A, C]) test(`${provider}: ${owner.role} avatar read/replace/remove, failed saves and safe DTOs`, async t => {
    const f = await storageFixture(t, 'profile-avatar', provider); const a = avatar(f.storage)
    const created = await updateSocialProfile(owner, owner._id, { bio: 'Avatar' }, a.deps); safe(created); assert.equal(created.hasAvatar, true)
    const first = a.saved[0].avatar
    assert.equal(first.storageReference.provider, provider); assert.equal(Boolean(first.filename), provider === 'local')
    assert.deepEqual((await getProfileAvatar(owner._id, a.deps)).buffer, png)
    // Admin can correct an owner's profile through the existing rule.
    const updated = await updateSocialProfile(D, owner._id, { bio: 'Replacement' }, a.deps); safe(updated)
    await assert.rejects(f.storage.read(first), { statusCode: 404 })
    const committed = a.saved[0].avatar
    a.fail(true)
    await assert.rejects(updateSocialProfile(owner, owner._id, { bio: 'Failed replacement' }, a.deps), /Avatar DB failure/)
    await assert.rejects(updateSocialProfile(owner, owner._id, { removeImage: true }, { ...a.deps, imageFile: undefined }), /Avatar DB failure/)
    assert.deepEqual(a.saved[0].avatar, committed); assert.deepEqual(await f.storage.read(committed), png)
    assert.equal(provider === 'local' ? (await readdir(path.join(f.directory, 'profile-avatars'))).length : f.objects.size, 1)
    a.fail(false)
    const removed = await updateSocialProfile(owner, owner._id, { removeImage: true }, { ...a.deps, imageFile: undefined }); safe(removed); assert.equal(removed.hasAvatar, false)
    await assert.rejects(f.storage.read(committed), { statusCode: 404 }); await assert.rejects(getProfileAvatar(owner._id, a.deps), { statusCode: 404 })
  })
}

for (const category of ['feed-image', 'profile-avatar']) test(`${category}: legacy files read without conversion; production refuses disk fallback`, async t => {
  const f = await storageFixture(t, category, 'local')
  const directory = category === 'profile-avatar' ? path.join(f.directory, 'profile-avatars') : f.directory
  await mkdir(directory, { recursive: true })
  // Retain the legacy filename format, including UUIDs not generated by the new adapter.
  const legacy = { filename: '00000000-0000-0000-0000-000000000000.png', mimeType: 'image/png', size: png.length }
  const legacyPath = path.join(directory, legacy.filename); await writeFile(legacyPath, png)
  assert.deepEqual(await f.storage.read(legacy), png)
  if (category === 'feed-image') {
    const deps = feed(f.storage); const post = await deps.postModel.create({ authorUserId: C._id, authorRole: C.role, content: 'Legacy', image: legacy })
    assert.deepEqual((await getPostImage(post._id, deps)).buffer, png)
    post.save = async function () { assert.deepEqual(await readFile(legacyPath), png); return this }
    await updatePost(C, post._id, { content: 'Replace legacy' }, deps)
  } else {
    const a = avatar(f.storage); a.saved.push({ userId: A._id, role: A.role, avatar: legacy })
    assert.equal((await getSocialProfile(A, A._id, a.deps)).hasAvatar, true)
    assert.deepEqual((await getProfileAvatar(A._id, a.deps)).buffer, png)
    await updateSocialProfile(A, A._id, { bio: 'Replace legacy' }, a.deps)
  }
  await assert.rejects(readFile(legacyPath), { code: 'ENOENT' })
  const cloud = await storageFixture(t, category, 'supabase')
  await assert.rejects(cloud.storage.read(legacy), { statusCode: 503 })
  await assert.rejects(cloud.storage.remove(legacy), { statusCode: 503 })
  const localReference = await f.storage.store(file)
  await assert.rejects(cloud.storage.read(localReference), { statusCode: 422 })
  const wrongCategory = { storageReference: { provider: 'supabase', key: '2027/resume/12345678-1234-4234-8234-123456789abc.pdf' } }
  await assert.rejects(cloud.storage.read(wrongCategory), { statusCode: 422 }); assert.equal(cloud.events.length, 0)
  // Traversal, oversized legacy bytes and symlinks cannot escape the local category.
  await assert.rejects(f.storage.read({ filename: '../outside.png' }), { statusCode: 422 })
  await writeFile(legacyPath, Buffer.alloc(5242881)); await assert.rejects(f.storage.read(legacy), { statusCode: 422 })
  await rm(legacyPath); const external = path.join(f.directory, 'outside.png'); await writeFile(external, png)
  await symlink(external, legacyPath); await assert.rejects(f.storage.read(legacy), { statusCode: 422 }); await assert.rejects(f.storage.remove(legacy), { statusCode: 422 })
  assert.deepEqual(await readFile(external), png)
})

test('cloud image authorization, Official/avatar constraints and signature errors never store', async t => {
  const f = await storageFixture(t, 'feed-image', 'supabase'); const deps = feed(f.storage)
  await assert.rejects(createPost(A, { content: 'Denied' }, deps), { statusCode: 403 })
  const post = await createPost(C, { content: 'Owned' }, deps); const before = f.events.length
  for (const actor of [A, E, D]) await assert.rejects(updatePost(actor, post._id, { content: 'Denied' }, deps), { statusCode: 403 })
  for (const actor of [A, E]) await assert.rejects(deletePost(actor, post._id, deps), { statusCode: 403 })
  await assert.rejects(updatePost(C, A._id, { content: 'Missing' }, deps), { statusCode: 404 })
  await assert.rejects(createPost(C, { contentType: 'article', title: 'Article', content: 'Text only' }, deps), { statusCode: 422 })
  for (const bad of [{ ...file, buffer: Buffer.from('invalid') }, { ...file, buffer: Buffer.alloc(0) }, { ...file, buffer: Buffer.alloc(5242881) }, { ...file, mimetype: 'image/svg+xml' }]) await assert.rejects(createPost(C, { content: 'Invalid' }, { ...deps, imageFile: bad }), { statusCode: 422 })
  assert.equal(f.events.length, before)
  const av = await storageFixture(t, 'profile-avatar', 'supabase'); const a = avatar(av.storage)
  await assert.rejects(updateSocialProfile(B, A._id, {}, a.deps), { statusCode: 403 })
  await assert.rejects(updateSocialProfile(D, D._id, {}, a.deps), { statusCode: 422 })
  await assert.rejects(updateSocialProfile(D, D._id, { removeImage: true }, { ...a.deps, imageFile: undefined }), { statusCode: 422 })
  await assert.rejects(updateSocialProfile(A, A._id, { removeImage: true }, a.deps), { statusCode: 422 })
  assert.equal(av.events.length, 0); assert.equal(a.events.length, 0)
})

test('Feed/avatars keep committed mutations when cleanup fails; failed cleanup cannot mask DB errors', async t => {
  const f = await storageFixture(t, 'feed-image', 'supabase'); const deps = feed(f.storage)
  const post = await createPost(C, { content: 'Old' }, deps); const row = deps.postModel.rows[0]; const old = row.image
  const removed = []; deps.removeImage = async image => { removed.push(image); throw new Error('cleanup failure') }
  await updatePost(C, post._id, { content: 'Committed' }, deps)
  assert.deepEqual(removed, [old]); assert.deepEqual(await f.storage.read(row.image), png)
  const committed = row.image; row.save = async () => { throw new Error('original DB error') }
  await assert.rejects(updatePost(C, post._id, { content: 'Fail' }, deps), /original DB error/)
  assert.deepEqual(row.image, committed); assert.notDeepEqual(removed.at(-1), committed)
  await assert.rejects(createPost(C, { content: 'Fail' }, { ...deps, postModel: { create: async () => { throw new Error('original create error') } } }), /original create error/)
  await deletePost(D, post._id, deps); assert.equal(deps.postModel.rows.length, 0)
  const av = await storageFixture(t, 'profile-avatar', 'supabase'); const a = avatar(av.storage)
  await updateSocialProfile(A, A._id, {}, a.deps); const previous = a.saved[0].avatar
  const avatarRemoved = []; a.deps.removeAvatar = async image => { avatarRemoved.push(image); throw new Error('cleanup failure') }
  await updateSocialProfile(A, A._id, {}, a.deps); assert.deepEqual(avatarRemoved, [previous]); assert.deepEqual(await av.storage.read(a.saved[0].avatar), png)
  a.fail(true); await assert.rejects(updateSocialProfile(A, A._id, {}, a.deps), /Avatar DB failure/)
  a.fail(false); const result = await updateSocialProfile(A, A._id, { removeImage: true }, { ...a.deps, imageFile: undefined })
  assert.equal(result.hasAvatar, false); assert.equal(a.saved[0].avatar, undefined)
})

test('post deletion preserves its image on DB failure and removes it only after parent deletion', async t => {
  const f = await storageFixture(t, 'feed-image', 'supabase'); const deps = feed(f.storage)
  const post = await createPost(C, { content: 'Delete' }, deps); const image = deps.postModel.rows[0].image
  const events = []; deps.removeImage = async metadata => { events.push('remove'); await f.storage.remove(metadata) }
  const deleteOne = deps.postModel.deleteOne.bind(deps.postModel)
  deps.postModel.deleteOne = async () => { events.push('delete'); throw new Error('Delete DB failure') }
  await assert.rejects(deletePost(D, post._id, deps), /Delete DB failure/); assert.deepEqual(events, ['delete']); assert.deepEqual(await f.storage.read(image), png)
  events.length = 0; deps.postModel.deleteOne = async filter => { events.push('delete'); return deleteOne(filter) }
  await deletePost(D, post._id, deps); assert.deepEqual(events, ['delete', 'remove'])
})

test('broadcast rollback keeps original errors and retains image if parent rollback fails', async t => {
  for (const parentFails of [false, true]) {
    const f = await storageFixture(t, 'feed-image', 'supabase'); const deps = feed(f.storage)
    deps.notificationModel.create = async () => { throw new Error('Broadcast failure') }
    deps.notificationModel.deleteMany = async () => { throw new Error('Delivery cleanup failure') }
    if (parentFails) deps.postModel.deleteOne = async () => { throw new Error('Parent cleanup failure') }
    await assert.rejects(createPost(D, { content: 'Broadcast', notifyCommunity: true }, deps), /Broadcast failure/)
    assert.equal(deps.postModel.rows.length, Number(parentFails)); assert.equal(f.objects.size, Number(parentFails))
  }
})

test('models accept local/legacy and cloud image metadata, enforce categories and retain Feed/Article rules', async t => {
  const f = await storageFixture(t, 'feed-image', 'supabase'); const av = await storageFixture(t, 'profile-avatar', 'supabase')
  const cloud = await f.storage.store(file); const avatar = await av.storage.store(file)
  for (const image of [cloud, { filename: '00000000-0000-0000-0000-000000000000.png', mimeType: 'image/png', size: png.length }]) {
    await new SocialPost({ authorUserId: C._id, authorRole: C.role, content: 'Feed', image }).validate()
    await assert.rejects(new SocialPost({ authorUserId: C._id, authorRole: C.role, contentType: 'article', title: 'Article', content: 'Text only', image }).validate(), /Articles are text only/)
  }
  await new SocialProfile({ userId: A._id, role: A.role, avatar }).validate()
  await assert.rejects(new SocialPost({ authorUserId: C._id, authorRole: C.role, content: 'No image' }).validate(), /Feed requires one image/)
  await assert.rejects(new SocialPost({ authorUserId: C._id, authorRole: C.role, content: 'Wrong category', image: avatar }).validate(), /storageReference.key/)
  await assert.rejects(new SocialProfile({ userId: A._id, role: A.role, avatar: cloud }).validate(), /storageReference.key/)
})
