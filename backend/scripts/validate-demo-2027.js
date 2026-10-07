import { env } from '../src/config/env.js'
import { buildDemo2027SeedPlan } from './demo-2027-seed-foundation.js'

try {
  console.info(JSON.stringify(buildDemo2027SeedPlan({ mongoUri: env.MONGO_URI, resumeUploadDirectory: env.RESUME_UPLOAD_DIR }), null, 2))
} catch (error) {
  console.error(`2027 demo validation failed: ${error.message}`)
  process.exitCode = 1
}
