import { connectDatabase, disconnectDatabase } from '../src/config/database.js'
import { auditTcsSmokeFixture, removeTcsSmokeFixture, TCS_SMOKE_FIXTURE_KEY } from './tcs-smoke-fixture-store.js'

async function run() {
  await connectDatabase()
  try {
    const audit = await auditTcsSmokeFixture()
    console.info(JSON.stringify({ fixture: TCS_SMOKE_FIXTURE_KEY, dryRun: true, found: audit.found, records: audit.records }, null, 2))
    const result = await removeTcsSmokeFixture()
    console.info(JSON.stringify({ fixture: TCS_SMOKE_FIXTURE_KEY, status: result.removed ? 'cleaned' : 'nothing_to_clean', records: result.records, manifestRemoved: result.manifestRemoved }, null, 2))
  } finally {
    await disconnectDatabase()
  }
}

run().catch(error => { console.error(error.message); process.exitCode = 1 })
