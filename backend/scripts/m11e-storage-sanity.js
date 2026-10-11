import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { createStorage } from '../src/storage/storage.js'
import { validatePublicEnvironment } from '../src/config/storage-config.js'

export const SANITY_CONFIRMATION = 'DISPOSABLE_PRIVATE_BUCKET_CHECK'

export function parseArguments(args) {
  if (args.length === 1 && args[0] === '--check-config') return { checkOnly: true }
  if (args.length === 1 && args[0] === `--confirm=${SANITY_CONFIRMATION}`) return { checkOnly: false }
  throw new Error('Use --check-config for an offline check, or explicit disposable storage sanity confirmation.')
}

export async function run(args = process.argv.slice(2)) {
  if (process.versions.node.split('.')[0] !== '24') throw new Error('Node 24.x is required.')
  const { checkOnly } = parseArguments(args)
  const loaded = dotenv.config({ path: '.env.m11e-sanity', override: true, quiet: true })
  if (loaded.error) throw new Error('Configure backend/.env.m11e-sanity locally before this check.')
  validatePublicEnvironment(process.env)
  if (process.env.NODE_ENV !== 'production' || process.env.AI_ENABLED !== 'false') throw new Error('Production mode with disabled AI is required.')
  // Configuration identity only: this command has no database connection or application imports.
  const storage = createStorage(process.env)
  if (storage.provider !== 'supabase') throw new Error('Private Supabase Storage is required.')
  if (checkOnly) { console.log('Storage configuration valid. No network calls made.'); return }
  console.log(JSON.stringify(await storage.sanityCheck()))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch(() => { console.error('Disposable storage check failed safely. Check backend configuration and private bucket availability; no provider secrets/errors are printed. Confirm cleanup in the private bucket before retrying.'); process.exitCode = 1 })
}
