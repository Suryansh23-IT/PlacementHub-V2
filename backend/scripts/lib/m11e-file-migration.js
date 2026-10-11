import path from 'node:path'
import { createHash } from 'node:crypto'
import { open, realpath, lstat, readdir } from 'node:fs/promises'
import { categoryPolicy, referencePolicy, STORAGE_CATEGORIES } from '../../src/storage/storage-contract.js'

export const DATABASE = 'placementhub-v2-demo-2027'
export const APPLY_CONFIRMATION = 'UPLOAD_AND_UPDATE_2027_CLOUD_REFERENCES'
const sha256 = value => createHash('sha256').update(value).digest('hex')
const safeFailure = code => Object.assign(new Error(code), { migrationCode: code })
const contained = (root, target) => { const relative = path.relative(root, target); return relative && !relative.startsWith('..') && !path.isAbsolute(relative) }
const archived = value => /(?:^|[\\/])[^\\/]*2026[^\\/]*(?:[\\/]|$)|historical|fixture:\/\//i.test(value)
const seedOwned = value => /(?:^|[\\/])[^\\/]*(?:demo[-_]seed|demo[-_]2027[-_]m9|m9[-_]|seed[-_]|reset[-_]|fixture[-_])[^\\/]*(?:[\\/]|$)/i.test(value)

export function guardDatabase(uri, { localOnly = false, cloudOnly = false } = {}) {
  let url
  try { url = new URL(uri) } catch { throw safeFailure('INVALID_DATABASE_CONFIGURATION') }
  if (!['mongodb:', 'mongodb+srv:'].includes(url.protocol) || url.pathname !== `/${DATABASE}`
    || url.searchParams.has('dbName')) throw safeFailure('EXACT_2027_DATABASE_REQUIRED')
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (localOnly && (!local || url.protocol !== 'mongodb:')) throw safeFailure('DRY_RUN_REQUIRES_LOCAL_2027_DATABASE')
  if (cloudOnly && (url.protocol !== 'mongodb+srv:' || !url.hostname.endsWith('.mongodb.net'))) throw safeFailure('APPLY_REQUIRES_EXPLICIT_ATLAS_TARGET')
  return DATABASE
}

export function guardConnection(repository) {
  if (repository.databaseName !== DATABASE) throw safeFailure('EXACT_2027_DATABASE_REQUIRED')
}

export const COLLECTIONS = Object.freeze({
  studentprofiles: ['resume', 'class10.marksheet', 'class12.marksheet', 'collegeResult'],
  companies: ['participationLetter'],
  placementdrives: ['documents', 'phaseExecution'],
  placementrecords: ['proof'],
  socialposts: ['image', 'contentType', 'deletedAt'],
  socialprofiles: ['avatar', 'role'],
})

export function* references(collection, record) {
  const item = (field, category, metadata) => ({ collection, id: record._id, field, category, metadata,
    expectedUpdatedAt: record.updatedAt,
    label: sha256(`${collection}:${record._id}:${field}`).slice(0, 16) })
  if (collection === 'studentprofiles') {
    for (const [field, category, metadata] of [
      ['resume', 'resume', record.resume], ['class10.marksheet', 'class10', record.class10?.marksheet],
      ['class12.marksheet', 'class12', record.class12?.marksheet], ['collegeResult', 'college-result', record.collegeResult],
    ]) if (metadata) yield item(field, category, metadata)
  }
  if (collection === 'companies' && record.participationLetter) yield item('participationLetter', 'participation-letter', record.participationLetter)
  if (collection === 'placementdrives') {
    for (const [field, category] of Object.entries({ companyRecruitmentInformation: 'company-recruitment-information',
      placementDriveJobDescription: 'drive-job-description', recruitmentProcessInstructions: 'recruitment-process-instructions' })) {
      if (record.documents?.[field]) yield item(`documents.${field}`, category, record.documents[field])
    }
    for (const [index, phase] of (record.phaseExecution ?? []).entries()) {
      if (phase.instructionPdf) yield item(`phaseExecution.${index}.instructionPdf`, 'phase-instruction', phase.instructionPdf)
    }
  }
  if (collection === 'placementrecords') for (const [index, proof] of (record.proof ?? []).entries()) yield item(`proof.${index}`, 'placement-proof', proof)
  if (collection === 'socialposts' && record.contentType !== 'article' && !record.deletedAt && record.image) yield item('image', 'feed-image', record.image)
  if (collection === 'socialprofiles' && record.avatar) yield item('avatar', 'profile-avatar', record.avatar)
}

function localCandidate(config, item) {
  const policy = categoryPolicy(config, item.category)
  const metadata = item.metadata
  let candidate
  if (metadata.storageReference) {
    const ref = metadata.storageReference
    const refPolicy = referencePolicy(config, ref.provider, ref)
    if (!['local', 'supabase'].includes(ref.provider) || !ref.key.startsWith(`2027/${item.category}/`)) throw safeFailure('UNSUPPORTED_REFERENCE')
    if (ref.provider === 'supabase') return { cloud: true }
    candidate = path.resolve(policy.directory, refPolicy.filename)
  } else if (item.category === 'feed-image' || item.category === 'profile-avatar') {
    if (typeof metadata.filename !== 'string' || !/^[a-f\d-]{36}\.(jpg|png|webp)$/.test(metadata.filename)
      || metadata.filename.includes('\n')) throw safeFailure('UNSUPPORTED_REFERENCE')
    candidate = path.resolve(policy.directory, metadata.filename)
  } else {
    if (typeof metadata.storagePath !== 'string') throw safeFailure('UNSUPPORTED_REFERENCE')
    if (metadata.storagePath.startsWith('fixture://')) throw safeFailure('EXCLUDED_FIXTURE_REFERENCE')
    candidate = path.resolve(metadata.storagePath)
    if (path.extname(candidate).toLowerCase() !== '.pdf') throw safeFailure('UNSUPPORTED_REFERENCE')
  }
  const root = path.resolve(policy.directory)
  if (archived(candidate)) throw safeFailure('EXCLUDED_ARCHIVED_REFERENCE')
  if (!contained(root, candidate)) throw safeFailure('UNSUPPORTED_REFERENCE')
  return { candidate, root, policy }
}

function validateContent(buffer, mimeType, category) {
  if (!['feed-image', 'profile-avatar'].includes(category)) {
    if (mimeType !== 'application/pdf' || !buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw safeFailure('INVALID_FILE_CONTENT')
  } else {
    const valid = mimeType === 'image/png' ? buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && buffer.toString('ascii', 12, 16) === 'IHDR'
      : mimeType === 'image/jpeg' ? buffer.length >= 4 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255 && buffer.at(-2) === 255 && buffer.at(-1) === 217
        : mimeType === 'image/webp' && buffer.length >= 16 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP' && ['VP8 ', 'VP8L', 'VP8X'].includes(buffer.toString('ascii', 12, 16))
    if (!valid) throw safeFailure('INVALID_FILE_CONTENT')
  }
}

export async function inspectLocal(config, item) {
  let location
  try { location = localCandidate(config, item) }
  catch (error) { throw safeFailure(error.migrationCode ?? 'UNSUPPORTED_REFERENCE') }
  if (location.cloud) return location
  let file
  try {
    const root = await realpath(location.root)
    if (archived(root)) throw safeFailure('EXCLUDED_ARCHIVED_REFERENCE')
    let component = location.root
    if ((await lstat(component)).isSymbolicLink()) throw safeFailure('UNSUPPORTED_REFERENCE')
    for (const segment of path.relative(location.root, location.candidate).split(path.sep)) {
      component = path.join(component, segment)
      if ((await lstat(component)).isSymbolicLink()) throw safeFailure('UNSUPPORTED_REFERENCE')
    }
    const target = await realpath(location.candidate)
    if (!contained(root, target)) throw safeFailure('UNSUPPORTED_REFERENCE')
    file = await open(target, 'r')
    const stat = await file.stat()
    if (!stat.isFile() || stat.size < 1 || stat.size > location.policy.maxBytes) throw safeFailure('INVALID_FILE_SIZE')
    const buffer = Buffer.alloc(location.policy.maxBytes + 1)
    let size = 0
    while (size < buffer.length) {
      const result = await file.read(buffer, size, buffer.length - size, size)
      if (!result.bytesRead) break
      size += result.bytesRead
    }
    if (!size || size > location.policy.maxBytes) throw safeFailure('INVALID_FILE_SIZE')
    const bytes = buffer.subarray(0, size)
    validateContent(bytes, item.metadata.mimeType, item.category)
    if (item.metadata.size !== undefined && item.metadata.size !== size) throw safeFailure('METADATA_SIZE_MISMATCH')
    return { path: target, buffer: bytes, size, digest: sha256(bytes) }
  } catch (error) { throw safeFailure(error.migrationCode ?? (error.code === 'ENOENT' ? 'MISSING_LOCAL_FILE' : 'LOCAL_READ_FAILED')) }
  finally { await file?.close().catch(() => {}) }
}

export function deterministicReference(config, item, digest) {
  const hex = sha256(`m11e:${DATABASE}:${item.collection}:${item.id}:${item.field}:${digest}`).split('')
  hex[12] = '4'; hex[16] = ['8', '9', 'a', 'b'][parseInt(hex[16], 16) % 4]
  const uuid = `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20, 32).join('')}`
  const extension = categoryPolicy(config, item.category).extensions[item.metadata.mimeType]
  const ref = { provider: 'supabase', key: `2027/${item.category}/${uuid}.${extension}` }
  referencePolicy(config, 'supabase', ref)
  return ref
}

async function orphanInventory(config, referencedPaths) {
  const result = { confirmed2027Orphans: 0, confirmed2027OrphanBytes: 0, unattributedSharedFiles: 0, excludedFiles: 0, scanFailures: 0 }
  const configuredRoots = [...new Set([config.RESUME_UPLOAD_DIR, config.SOCIAL_UPLOAD_DIR].map(value => path.resolve(value)))]
  const roots = configuredRoots.filter(root => !configuredRoots.some(other => other !== root && contained(other, root)))
  async function walk(directory) {
    let entries
    try {
      if ((await lstat(directory)).isSymbolicLink() || archived(await realpath(directory))) { result.excludedFiles++; return }
      entries = await readdir(directory, { withFileTypes: true })
    }
    catch (error) { if (error.code !== 'ENOENT') result.scanFailures++; return }
    for (const entry of entries) {
      const target = path.join(directory, entry.name)
      if (archived(target) || entry.isSymbolicLink()) { result.excludedFiles++; continue }
      if (entry.isDirectory()) { await walk(target); continue }
      if (!entry.isFile() || !/\.(pdf|jpg|jpeg|png|webp)$/i.test(entry.name)) continue
      if (referencedPaths.has(target)) continue
      if (seedOwned(target)) { result.excludedFiles++; continue }
      if (/(?:^|[\\/])[^\\/]*2027[^\\/]*(?:[\\/]|$)/.test(target)) {
        result.confirmed2027Orphans++; result.confirmed2027OrphanBytes += (await lstat(target)).size
      } else result.unattributedSharedFiles++
    }
  }
  for (const root of roots) await walk(root)
  return result
}

export async function inventory2027(repository, config) {
  guardConnection(repository)
  if ([config.RESUME_UPLOAD_DIR, config.SOCIAL_UPLOAD_DIR].some(root => typeof root !== 'string' || archived(path.resolve(root)))) throw safeFailure('ARCHIVED_SOURCE_ROOT_FORBIDDEN')
  const items = []; const referencedPaths = new Set()
  const report = { mode: 'DRY_RUN', database: DATABASE, categories: {}, issues: [], totalReferences: 0, localBytes: 0, cloudRecordedBytes: 0 }
  for (const category of STORAGE_CATEGORIES) report.categories[category] = { prefix: `2027/${category}/`, local: 0, cloud: 0, missing: 0, unsupported: 0, excluded: 0, bytes: 0 }
  for (const collection of Object.keys(COLLECTIONS)) {
    for await (const record of repository.records(collection, COLLECTIONS[collection])) {
      for (const item of references(collection, record)) {
        report.totalReferences++
        const counts = report.categories[item.category]
        try {
          const candidate = localCandidate(config, item)
          if (candidate.candidate) referencedPaths.add(candidate.candidate)
          const inspected = await inspectLocal(config, item)
          if (inspected.cloud) { counts.cloud++; report.cloudRecordedBytes += Number(item.metadata.size) || 0; continue }
          const ref = deterministicReference(config, item, inspected.digest)
          counts.local++; counts.bytes += inspected.size; report.localBytes += inspected.size
          referencedPaths.add(inspected.path)
          // Keep private operational records out of the printable summary.
          items.push({ ...item, digest: inspected.digest, size: inspected.size, reference: ref })
        } catch (error) {
          const code = error.migrationCode ?? 'UNSUPPORTED_REFERENCE'
          if (code === 'MISSING_LOCAL_FILE') counts.missing++
          else if (code.startsWith('EXCLUDED_')) counts.excluded++
          else counts.unsupported++
          report.issues.push({ category: item.category, item: item.label, code })
        }
      }
    }
  }
  report.filesystem = await orphanInventory(config, referencedPaths)
  return { report, items }
}

export async function migrate2027(repository, config, { apply = false, confirmation, cloud } = {}) {
  guardConnection(repository)
  if (apply && confirmation !== APPLY_CONFIRMATION) throw safeFailure('EXPLICIT_MIGRATION_CONFIRMATION_REQUIRED')
  const inventory = await inventory2027(repository, config)
  if (!apply) return inventory.report
  if (!cloud || cloud.provider !== 'supabase') throw safeFailure('PRIVATE_CLOUD_ADAPTER_REQUIRED')
  const report = { ...inventory.report, mode: 'APPLY', migrated: 0, reusedUploads: 0, failed: 0 }
  for (const item of inventory.items) {
    try {
      const local = await inspectLocal(config, item)
      if (local.digest !== item.digest || local.size !== item.size) throw safeFailure('SOURCE_CHANGED_AFTER_INVENTORY')
      let uploaded
      try { uploaded = await cloud.read(item.reference); report.reusedUploads++ }
      catch (error) {
        if (error.errorCode !== 'NOT_FOUND') throw safeFailure('CLOUD_READ_FAILED')
        try { await cloud.store({ category: item.category, buffer: local.buffer, mimeType: item.metadata.mimeType, key: item.reference.key }) }
        catch { throw safeFailure('UPLOAD_FAILED') }
        try { uploaded = await cloud.read(item.reference) }
        catch { throw safeFailure('VERIFICATION_FAILED') }
      }
      if (!Buffer.isBuffer(uploaded) || uploaded.length !== local.size || sha256(uploaded) !== local.digest) throw safeFailure('VERIFICATION_FAILED')
      const metadata = { ...item.metadata, storageReference: item.reference }
      delete metadata.storagePath; delete metadata.filename
      guardConnection(repository)
      if (!await repository.replaceIfUnchanged(item, metadata)) throw safeFailure('DATABASE_REFERENCE_CHANGED')
      report.migrated++
    } catch (error) {
      report.failed++
      report.issues.push({ category: item.category, item: item.label, code: error.migrationCode ?? 'DATABASE_UPDATE_FAILED' })
    }
  }
  // Never delete source files or uncommitted cloud objects: verified objects support safe retries.
  return report
}

export function mongoRepository(database) {
  return {
    databaseName: database.databaseName,
    records: (collection, fields) => database.collection(collection).find({}, { projection: { ...Object.fromEntries(fields.map(field => [field, 1])), updatedAt: 1 } }).sort({ _id: 1 }),
    async replaceIfUnchanged(item, metadata) {
      const result = await database.collection(item.collection).updateOne({ _id: item.id, [item.field]: item.metadata,
        updatedAt: item.expectedUpdatedAt ?? { $exists: false } }, { $set: { [item.field]: metadata } })
      return result.matchedCount === 1
    },
  }
}

export async function fingerprint2027(repository) {
  guardConnection(repository)
  const hash = createHash('sha256')
  for (const collection of Object.keys(COLLECTIONS)) {
    hash.update(collection)
    for await (const record of repository.records(collection, COLLECTIONS[collection])) hash.update(JSON.stringify(record))
  }
  return hash.digest('hex')
}
