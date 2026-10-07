import mongoose from 'mongoose'
import { connectDatabase, disconnectDatabase } from '../src/config/database.js'
import { PlacementRecord } from '../src/modules/placements/placement-record.model.js'

export async function ensureSparsePlacementRecordApplicationIndex() {
  if (!mongoose.connection.name.toLowerCase().includes('placementhub')) throw new Error(`Refusing to migrate unexpected database: ${mongoose.connection.name}`)
  const index = (await PlacementRecord.collection.indexes()).find(candidate => candidate.name === 'applicationId_1')
  if (index?.unique && index?.sparse) return { status: 'already_sparse' }
  const records = await PlacementRecord.countDocuments()
  if (records !== 0) throw new Error(`Refusing to rebuild applicationId index while ${records} placement records exist`)
  if (index) await PlacementRecord.collection.dropIndex('applicationId_1')
  await PlacementRecord.collection.createIndex({ applicationId: 1 }, { unique: true, sparse: true, name: 'applicationId_1' })
  return { status: 'recreated_sparse_unique' }
}

if (process.argv[1]?.endsWith('migrate-placement-record-application-index.js')) {
  try { await connectDatabase(); console.info(JSON.stringify(await ensureSparsePlacementRecordApplicationIndex(), null, 2)) } catch (error) { console.error('PlacementRecord index migration failed:', error.message); process.exitCode = 1 } finally { await disconnectDatabase() }
}
