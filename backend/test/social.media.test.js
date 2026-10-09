import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fixture, A, D } from './social-fixture.js'
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/placementhub-v2-test'
const { validateImageFile, storeImage, removeImage, imagePath } = await import('../src/modules/social/social.media.js')
const { createPost, updatePost, deletePost, getPostImage } = await import('../src/modules/social/social.service.js')
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM1sAAAAASUVORK5CYII=', 'base64')
const file = { originalname: '../../evil.png', mimetype: 'image/png', buffer: png }
async function temporary(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'placementhub-social-test-'))
  try { await run(directory) } finally { assert.ok(path.basename(directory).startsWith('placementhub-social-test-')); await rm(directory, { recursive: true, force: true }) }
}
test('supported PNG/JPEG/WebP signatures are accepted and MIME spoof/empty/oversize rejected', () => {
  validateImageFile(file)
  validateImageFile({ mimetype: 'image/jpeg', buffer: Buffer.from([255, 216, 255, 224, 255, 217]) })
  validateImageFile({ mimetype: 'image/webp', buffer: Buffer.from('RIFFxxxxWEBPVP8 xxxx') })
  for (const bad of [{ mimetype: 'image/svg+xml', buffer: png }, { mimetype: 'image/png', buffer: Buffer.from('<script>bad</script>') }, { mimetype: 'image/jpeg', buffer: png }, { mimetype: 'image/png', buffer: Buffer.alloc(0) }]) assert.throws(() => validateImageFile(bad), { errorCode: 'VALIDATION_ERROR' })
  assert.throws(() => validateImageFile(file, 1), { errorCode: 'VALIDATION_ERROR' })
})
test('stored filename ignores client path; path traversal references are rejected', async () => temporary(async directory => {
  const image = await storeImage(file, directory)
  assert.match(image.filename, /^[a-f\d-]{36}\.png$/)
  assert.equal(path.dirname(imagePath(image, directory)), directory)
  assert.deepEqual(await readFile(imagePath(image, directory)), png)
  for (const filename of ['../evil.png', 'C:\\evil.png', '/etc/file', 'test.svg']) assert.throws(() => imagePath({ filename }, directory))
  await removeImage(image, directory); await removeImage(image, directory)
  assert.deepEqual(await readdir(directory), [])
}))
test('Feed image metadata is safe, image-free Feed rejected and Article upload is rejected', async () => temporary(async directory => {
  const deps = { ...fixture(), imageFile: file, storeImage: f => storeImage(f, directory), removeImage: i => removeImage(i, directory) }
  const post = await createPost(D, { content: 'Caption' }, deps)
  assert.deepEqual(post.image, { mimeType: 'image/png', size: png.length })
  assert.ok(!JSON.stringify(post).includes(directory)); assert.equal(post.image.filename, undefined)
  await assert.rejects(createPost(D, { contentType: 'article', title: 'Title', content: 'Body' }, deps), { errorCode: 'VALIDATION_ERROR' })
  assert.equal((await readdir(directory)).length, 1)
  await assert.rejects(createPost(D, { content: 'Plain' }, { ...deps, imageFile: undefined }), { statusCode: 422 })
}))
test('non-admin upload is forbidden before writing any file', async () => temporary(async directory => {
  await assert.rejects(createPost(A, { content: 'Not allowed' }, { ...fixture(), imageFile: file, storeImage: f => storeImage(f, directory) }), { errorCode: 'FORBIDDEN' })
  assert.deepEqual(await readdir(directory), [])
}))
test('editing preserves image, replacement deletes previous image, removal without replacement rejected', async () => temporary(async directory => {
  const deps = { ...fixture(), imageFile: file, storeImage: f => storeImage(f, directory), removeImage: i => removeImage(i, directory) }
  const post = await createPost(D, { content: 'Before' }, deps)
  const first = deps.postModel.rows[0].image.filename
  await updatePost(D, post._id, { content: 'Edit only' }, { ...deps, imageFile: undefined })
  assert.equal(deps.postModel.rows[0].image.filename, first)
  await updatePost(D, post._id, { content: 'Replace' }, deps)
  const second = deps.postModel.rows[0].image.filename; assert.notEqual(second, first); assert.deepEqual(await readdir(directory), [second])
  await assert.rejects(updatePost(D, post._id, { content: 'Remove', removeImage: true }, { ...deps, imageFile: undefined }), { statusCode: 422 })
  assert.deepEqual(await readdir(directory), [second]); assert.equal(deps.postModel.rows[0].image.filename, second)
  await updatePost(D, post._id, { content: 'Replace intentionally', removeImage: true }, deps)
  assert.equal((await readdir(directory)).length, 1)
}))
test('failed create/save removes newly written image and preserves old image file', async () => temporary(async directory => {
  const deps = { ...fixture(), imageFile: file, storeImage: f => storeImage(f, directory), removeImage: i => removeImage(i, directory) }
  await assert.rejects(createPost(D, { content: 'Failure' }, { ...deps, postModel: { create: async () => { throw new Error('DB failure') } } }), /DB failure/)
  assert.deepEqual(await readdir(directory), [])
  const post = await createPost(D, { content: 'Original' }, deps); const original = deps.postModel.rows[0].image.filename
  deps.postModel.rows[0].save = async () => { throw new Error('Save failure') }
  await assert.rejects(updatePost(D, post._id, { content: 'Replace' }, deps), /Save failure/)
  assert.deepEqual(await readdir(directory), [original])
}))
test('Feed deletion removes stored image and child records', async () => temporary(async directory => {
  const deps = { ...fixture(), imageFile: file, storeImage: f => storeImage(f, directory), removeImage: i => removeImage(i, directory) }
  const post = await createPost(D, { content: 'Delete' }, deps); await deletePost(D, post._id, deps)
  assert.deepEqual(await readdir(directory), []); assert.equal(deps.postModel.rows.length, 0)
}))
test('image lookup rejects missing, image-free and Article records', async () => {
  const deps = fixture(); const plain = await deps.postModel.create({ authorUserId: D._id, authorRole: D.role, content: 'Legacy plain' })
  const article = await createPost(D, { contentType: 'article', title: 'Title', content: 'Body' }, deps)
  for (const id of [A._id, plain._id, article._id]) await assert.rejects(getPostImage(id, deps), { errorCode: 'NOT_FOUND' })
})
