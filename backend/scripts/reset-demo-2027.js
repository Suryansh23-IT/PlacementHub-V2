import { connectDatabase, disconnectDatabase } from '../src/config/database.js'
import { env } from '../src/config/env.js'
import { assertDemo2027Database, resetDemo2027Seed } from './demo-2027-seed-foundation.js'

try {
  if (!process.argv.includes('--confirm')) throw new Error('Refusing reset without --confirm.')
  assertDemo2027Database(env.MONGO_URI)
  await connectDatabase()
  console.info(JSON.stringify(await resetDemo2027Seed({ mongoUri: env.MONGO_URI, resumeUploadDirectory: env.RESUME_UPLOAD_DIR, confirm: true }), null, 2))
} catch (error) {
  console.error(`2027 demo reset failed: ${error.message}`)
  process.exitCode = 1
} finally {
  await disconnectDatabase().catch(() => undefined)
}
