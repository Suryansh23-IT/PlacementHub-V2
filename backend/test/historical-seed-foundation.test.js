import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { loadHistoricalCanonicalInput, resetHistoricalSeed, validateHistoricalSeedInvocation } from '../scripts/historical-seed-foundation.js'

const modelNames = [
  'Notification', 'PlacementRecord', 'PlacementRestriction', 'IncidentReport', 'Application',
  'PlacementDrive', 'StudentPolicyAcceptance', 'RecruiterPolicyAcceptance', 'StudentProfile', 'Company', 'User',
]

function createDependencies(manifest) {
  const calls = []
  const model = name => ({
    async countDocuments(query) {
      calls.push(`count:${name}`)
      return query._id.$in.length
    },
    async deleteMany(query) {
      calls.push(`delete:${name}`)
      return { deletedCount: query._id.$in.length }
    },
  })
  const dependencies = Object.fromEntries(modelNames.map(name => [name, model(name)]))
  dependencies.HistoricalSeedManifest = {
    async findOne() {
      calls.push('find:manifest')
      return manifest
    },
    async deleteOne() {
      calls.push('delete:manifest')
      return { deletedCount: 1 }
    },
  }
  return { dependencies, calls }
}

function ownedManifest() {
  return {
    _id: 'historical-manifest',
    studentUserIds: ['student-user'],
    studentProfileIds: ['student-profile'],
    companyUserIds: ['company-user'],
    companyProfileIds: ['company-profile'],
    studentPolicyAcceptanceIds: ['student-policy'],
    recruiterPolicyAcceptanceIds: ['company-policy'],
    placementDriveIds: ['drive'],
    applicationIds: ['application'],
    placementRecordIds: ['record'],
    notificationIds: ['notification'],
    placementRestrictionIds: ['restriction'],
    incidentReportIds: ['incident'],
    ownedUploadDirectories: [path.resolve('uploads', 'historical-seeds', 'NITR-PLACEMENT-2025-26', 'proofs')],
    ownedUploadPaths: [],
  }
}

test('M8.5A canonical input validates without generating records', async () => {
  const result = await validateHistoricalSeedInvocation()
  assert.equal(result.seedKey, 'NITR-PLACEMENT-2025-26')
  assert.equal(result.status, 'validated_only')
  assert.equal(result.generatedRecords, 0)

  const secondResult = await validateHistoricalSeedInvocation()
  assert.deepEqual(secondResult, result)
})

test('M8.5A dry-run audits only and changes nothing', async () => {
  const { dependencies, calls } = createDependencies(ownedManifest())
  const result = await resetHistoricalSeed({ dependencies })

  assert.equal(result.mode, 'dry_run')
  assert.equal(result.requiresConfirmation, true)
  assert.equal(result.removed, false)
  assert.equal(calls.some(call => call.startsWith('delete:')), false)
})

test('M8.5A executes only after explicit confirmation and preserves unowned admin/configuration', async () => {
  const { dependencies, calls } = createDependencies(ownedManifest())
  const removedPaths = []
  const result = await resetHistoricalSeed({
    confirm: true,
    dependencies,
    uploadRoot: path.resolve('uploads', 'historical-seeds', 'NITR-PLACEMENT-2025-26'),
    remove: async target => removedPaths.push(target),
  })

  assert.equal(result.removed, true)
  assert.deepEqual(calls.filter(call => call.startsWith('delete:')), [
    'delete:Notification', 'delete:PlacementRecord', 'delete:PlacementRestriction', 'delete:IncidentReport',
    'delete:Application', 'delete:PlacementDrive', 'delete:StudentPolicyAcceptance', 'delete:RecruiterPolicyAcceptance',
    'delete:StudentProfile', 'delete:Company', 'delete:User', 'delete:manifest',
  ])
  assert.deepEqual(removedPaths, [ownedManifest().ownedUploadDirectories[0]])
  assert.equal(calls.includes('delete:InstitutionProfile'), false)
  assert.equal(calls.includes('delete:Admin'), false)
})

test('M8.5A reset is idempotent when no historical manifest remains', async () => {
  const { dependencies, calls } = createDependencies(null)
  const result = await resetHistoricalSeed({ confirm: true, dependencies })

  assert.equal(result.found, false)
  assert.equal(result.removed, false)
  assert.deepEqual(calls, ['find:manifest'])
})

test('M8.5A refuses an owned upload path outside its seed root', async () => {
  const manifest = ownedManifest()
  manifest.ownedUploadDirectories = [path.resolve('uploads', 'other-seed')]
  const { dependencies, calls } = createDependencies(manifest)

  await assert.rejects(
    resetHistoricalSeed({
      confirm: true,
      dependencies,
      uploadRoot: path.resolve('uploads', 'historical-seeds', 'NITR-PLACEMENT-2025-26'),
      remove: async () => {},
    }),
    /outside the historical seed upload root/,
  )
  assert.equal(calls.some(call => call.startsWith('delete:')), false)
})

test('M8.5A rejects malformed canonical data before a future seed can run', async () => {
  await assert.rejects(
    loadHistoricalCanonicalInput({
      filePath: 'ignored.json',
      read: async () => JSON.stringify({ metadata: { seedKey: 'wrong' } }),
    }),
  )
})
