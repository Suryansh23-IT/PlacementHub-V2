import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import { storageConfigSchema, validatePublicEnvironment } from '../src/config/storage-config.js'
import { createStorage } from '../src/storage/storage.js'
import { APPLY_CONFIRMATION, DATABASE, guardDatabase, fingerprint2027, migrate2027, mongoRepository } from './lib/m11e-file-migration.js'

export function parseArguments(args) {
  const options = { apply: false, envFile: '.env.cycle-2027' }
  for (const arg of args) {
    if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--apply') options.apply = true
    else if (arg.startsWith('--env-file=')) options.envFile = arg.slice('--env-file='.length)
    else if (arg.startsWith('--confirm=')) options.confirmation = arg.slice('--confirm='.length)
    else throw new Error('Unsupported migration option.')
  }
  if (options.apply && (options.dryRun || options.confirmation !== APPLY_CONFIRMATION)) throw new Error('Explicit migration confirmation is required; do not combine --apply and --dry-run.')
  if (!options.envFile || /2026|historical/i.test(options.envFile)) throw new Error('Archived environment files are forbidden.')
  return options
}

export async function run(args = process.argv.slice(2)) {
  if (process.versions.node.split('.')[0] !== '24') throw new Error('Node 24.x is required.')
  const options = parseArguments(args)
  dotenv.config({ path: '.env', quiet: true })
  const loaded = dotenv.config({ path: options.envFile, override: true, quiet: true })
  if (loaded.error) throw new Error('The selected local environment file could not be loaded.')
  validatePublicEnvironment(process.env)
  const uri = options.apply ? process.env.MIGRATION_TARGET_MONGO_URI : process.env.MONGO_URI
  guardDatabase(uri, { localOnly: !options.apply, cloudOnly: options.apply })
  const local = storageConfigSchema.parse({
    NODE_ENV: 'test', STORAGE_PROVIDER: 'local', RESUME_UPLOAD_DIR: process.env.RESUME_UPLOAD_DIR,
    SOCIAL_UPLOAD_DIR: process.env.SOCIAL_UPLOAD_DIR, RESUME_MAX_FILE_SIZE_BYTES: process.env.RESUME_MAX_FILE_SIZE_BYTES,
    SOCIAL_IMAGE_MAX_BYTES: process.env.SOCIAL_IMAGE_MAX_BYTES,
  })
  if (options.apply && process.env.AI_ENABLED !== 'false') throw new Error('Keep production AI explicitly disabled.')
  const cloud = options.apply ? createStorage({ ...process.env, NODE_ENV: 'production', MONGO_URI: uri }) : undefined
  const connection = await mongoose.createConnection(uri, { autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 5000 }).asPromise()
  try {
    if (connection.name !== DATABASE) throw new Error('Exact 2027 database connection required.')
    const repository = mongoRepository(connection.db)
    const before = options.apply ? undefined : await fingerprint2027(repository)
    const report = await migrate2027(repository, local, { ...options, cloud })
    if (!options.apply) report.databaseReferencesUnchanged = before === await fingerprint2027(repository)
    console.log(JSON.stringify(report, null, 2))
    if (report.failed || report.issues.length || report.filesystem.scanFailures || report.databaseReferencesUnchanged === false) process.exitCode = 2
    return report
  } finally { await connection.close() }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch(() => { console.error('2027 file tooling stopped safely. Check the selected environment, exact database identity and explicit confirmation. No raw provider/configuration error is printed.'); process.exitCode = 1 })
}
