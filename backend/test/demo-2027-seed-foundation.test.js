import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { DEMO_2027_DATABASE_NAME, DEMO_2027_SEED_KEY, assertDemo2027Database, buildDemo2027SeedPlan, canonicalSourceHash, demo2027UploadRoot, prepareDemo2027SeedManifest, resetDemo2027Seed } from '../scripts/demo-2027-seed-foundation.js'

const demoUri = `mongodb://127.0.0.1:27017/${DEMO_2027_DATABASE_NAME}`
const resumeDirectory = path.resolve('uploads', 'resumes')

function manifestModel() {
  let document
  return {
    async findOne() { return document ?? null },
    async create(input) { document = { ...input, async save() { return this } }; return document },
    get document() { return document },
  }
}

test('M9A guard accepts only the dedicated 2027 Mongo database name', () => {
  assert.equal(assertDemo2027Database(demoUri), DEMO_2027_DATABASE_NAME)
  assert.throws(() => assertDemo2027Database('mongodb://127.0.0.1:27017/placementhub-v2'), { errorCode: 'DEMO_DATABASE_GUARD' })
  assert.throws(() => assertDemo2027Database('mongodb://127.0.0.1:27017/NITR-PLACEMENT-2025-26'), { errorCode: 'DEMO_DATABASE_GUARD' })
  assert.throws(() => assertDemo2027Database('not-a-url'), { errorCode: 'VALIDATION_ERROR' })
})

test('M9A seed plan is deterministic and deliberately declares no seeded workflow records', () => {
  const first = buildDemo2027SeedPlan({ mongoUri: demoUri, resumeUploadDirectory: resumeDirectory })
  const second = buildDemo2027SeedPlan({ mongoUri: demoUri, resumeUploadDirectory: resumeDirectory })
  assert.deepEqual(first, second)
  assert.equal(first.key, DEMO_2027_SEED_KEY)
  assert.equal(first.applications, 0)
  assert.equal(first.placementRecords, 0)
  assert.equal(first.resumeGeneration, 'assets_validated_no_uploads_created')
  assert.deepEqual(first.documents, { studentResumeCount: 60, companyDocumentCount: 15, driveDocumentMappingCount: 6 })
  assert.equal(first.uploadRoot, demo2027UploadRoot(resumeDirectory))
  assert.match(first.canonicalSourceHash, /^[a-f\d]{64}$/)
  assert.equal(first.canonicalSourceHash, canonicalSourceHash())
})

test('M9A manifest preparation is idempotent and records only a dedicated upload root', async () => {
  const model = manifestModel()
  const first = await prepareDemo2027SeedManifest({ mongoUri: demoUri, resumeUploadDirectory: resumeDirectory, manifestModel: model })
  const second = await prepareDemo2027SeedManifest({ mongoUri: demoUri, resumeUploadDirectory: resumeDirectory, manifestModel: model })
  assert.equal(first.alreadyPrepared, false)
  assert.equal(second.alreadyPrepared, true)
  assert.equal(model.document.key, DEMO_2027_SEED_KEY)
  assert.deepEqual(model.document.ownedUploadDirectories, [demo2027UploadRoot(resumeDirectory)])
})

test('M9A reset is confirmation-gated, idempotent when absent, and targets only manifest-owned IDs', async () => {
  const missing = { async findOne() { return null } }
  await assert.rejects(resetDemo2027Seed({ mongoUri: demoUri, resumeUploadDirectory: resumeDirectory, manifestModel: missing }), { errorCode: 'CONFIRMATION_REQUIRED' })
  assert.deepEqual(await resetDemo2027Seed({ mongoUri: demoUri, resumeUploadDirectory: resumeDirectory, confirm: true, manifestModel: missing }), { status: 'not_seeded', removed: {}, uploadRoot: demo2027UploadRoot(resumeDirectory) })

  const deletions = []
  const removals = []
  const root = demo2027UploadRoot(resumeDirectory)
  const manifest = { key: DEMO_2027_SEED_KEY, status: 'ready', studentUserIds: ['student-owned'], ownedUploadDirectories: [root], ownedUploadPaths: [path.join(root, 'resume.pdf')], async save() { return this } }
  const model = { async findOne() { return manifest } }
  const userModel = { async deleteMany(query) { deletions.push(query); return { deletedCount: 1 } } }
  const result = await resetDemo2027Seed({ mongoUri: demoUri, resumeUploadDirectory: resumeDirectory, confirm: true, manifestModel: model, collections: [['studentUserIds', userModel]], remove: async (target) => removals.push(target) })
  assert.equal(result.status, 'reset')
  assert.deepEqual(deletions, [{ _id: { $in: ['student-owned'] } }])
  assert.deepEqual(removals, [path.join(root, 'resume.pdf'), root])
  assert.equal(manifest.status, 'reset')
})

test('M9A reset rejects a manifest that tries to own historical or broad uploads', async () => {
  const root = demo2027UploadRoot(resumeDirectory)
  const manifest = { key: DEMO_2027_SEED_KEY, ownedUploadDirectories: [path.dirname(root)], ownedUploadPaths: [], async save() { return this } }
  await assert.rejects(resetDemo2027Seed({ mongoUri: demoUri, resumeUploadDirectory: resumeDirectory, confirm: true, manifestModel: { async findOne() { return manifest } } }), { errorCode: 'DEMO_UPLOAD_GUARD' })
  assert.equal(manifest.status, undefined)
})
