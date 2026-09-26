import { connectDatabase, disconnectDatabase } from '../src/config/database.js'
import { PlacementRestriction } from '../src/modules/applications/placement-restriction.model.js'

async function migrateRestrictionHistoryIndex() {
  await connectDatabase()
  try {
    const indexes = await PlacementRestriction.collection.indexes()
    const legacyUniqueIndex = indexes.find(index => index.name === 'studentId_1' && index.unique === true && index.key?.studentId === 1 && Object.keys(index.key).length === 1)
    if (!legacyUniqueIndex) {
      console.info('Placement restriction history index is already compatible.')
      return
    }
    await PlacementRestriction.collection.dropIndex(legacyUniqueIndex.name)
    console.info('Removed the legacy unique PlacementRestriction student index; historical restrictions can now be retained.')
  } finally {
    await disconnectDatabase()
  }
}

migrateRestrictionHistoryIndex().catch(error => {
  console.error('Placement restriction history index migration failed.', error)
  process.exitCode = 1
})
