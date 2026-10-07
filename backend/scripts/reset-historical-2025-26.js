import { connectDatabase, disconnectDatabase } from '../src/config/database.js'
import { resetHistoricalSeed } from './historical-seed-foundation.js'

const args = new Set(process.argv.slice(2))
const unsupportedArgs = [...args].filter(argument => !['--confirm', '--dry-run'].includes(argument))

if (unsupportedArgs.length) {
  console.error(`Unsupported reset option(s): ${unsupportedArgs.join(', ')}`)
  process.exitCode = 1
} else {
  const confirm = args.has('--confirm') && !args.has('--dry-run')
  try {
    await connectDatabase()
    const result = await resetHistoricalSeed({ confirm })
    console.info(JSON.stringify(result, null, 2))
  } catch (error) {
    console.error('Historical reset failed:', error.message)
    process.exitCode = 1
  } finally {
    await disconnectDatabase()
  }
}
