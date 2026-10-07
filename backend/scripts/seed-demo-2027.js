import { env } from '../src/config/env.js'
import { connectDatabase, disconnectDatabase } from '../src/config/database.js'
import { assertDemo2027Database, seedDemo2027Foundation, verifyDemo2027Foundation } from './demo-2027-seed-foundation.js'

try {
  const databaseName = assertDemo2027Database(env.MONGO_URI)
  console.info(JSON.stringify({ status: 'guarded_seed_starting', databaseName }, null, 2))
  await connectDatabase()
  const seeded = await seedDemo2027Foundation({ mongoUri: env.MONGO_URI, resumeUploadDirectory: env.RESUME_UPLOAD_DIR, studentPassword: env.DEMO_2027_STUDENT_PASSWORD, companyPassword: env.DEMO_2027_COMPANY_PASSWORD, saltRounds: env.BCRYPT_SALT_ROUNDS })
  const verification = await verifyDemo2027Foundation()
  console.info(JSON.stringify({ status: seeded.status, databaseName, verification }, null, 2))
} catch (error) {
  console.error(`2027 demo seed foundation failed: ${error.message}`)
  process.exitCode = 1
} finally { await disconnectDatabase().catch(() => undefined) }
