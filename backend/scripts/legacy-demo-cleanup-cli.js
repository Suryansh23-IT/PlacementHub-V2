import { connectDatabase, disconnectDatabase } from '../src/config/database.js'
import { cleanupLegacyDemo } from './legacy-demo-cleanup.js'

const confirm = process.argv.slice(2).includes('--confirm-replace-current-demo')
try {
  await connectDatabase()
  console.info(JSON.stringify(await cleanupLegacyDemo({ confirm }), null, 2))
} catch (error) {
  console.error('Legacy demo cleanup failed:', error.message)
  process.exitCode = 1
} finally {
  await disconnectDatabase()
}
