import { validateHistoricalSeedInvocation } from './historical-seed-foundation.js'

try {
  const result = await validateHistoricalSeedInvocation()
  console.info(JSON.stringify(result, null, 2))
} catch (error) {
  console.error('Historical seed configuration is invalid:', error.message)
  process.exitCode = 1
}
