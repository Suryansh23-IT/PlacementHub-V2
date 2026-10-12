import path from 'node:path'
import { open, realpath, lstat, unlink } from 'node:fs/promises'
import { env } from '../config/env.js'
import { AppError } from '../errors/app-error.js'
import { createStorage } from './storage.js'
import { storageConfigSchema } from '../config/storage-config.js'
import { categoryPolicy, referencePolicy, storageInvalid, storageMissing, storageUnavailable } from './storage-contract.js'

export function publicPdfMetadata(metadata) {
  if (!metadata) return undefined
  const { originalName, mimeType, size, uploadedAt } = metadata.toObject ? metadata.toObject() : metadata
  return { originalName, mimeType, size, uploadedAt }
}

export function createPdfStorage(input, category, dependencies = {}) {
  const config = storageConfigSchema.parse(input)
  const policy = categoryPolicy(config, category)
  if (policy.extensions['application/pdf'] !== 'pdf') throw storageInvalid()
  const storage = dependencies.storage ?? createStorage(config, dependencies)
  function reference(metadata) {
    const ref = metadata.storageReference?.toObject ? metadata.storageReference.toObject() : metadata.storageReference
    referencePolicy(config, config.STORAGE_PROVIDER, ref)
    if (!ref.key.startsWith(`2027/${category}/`)) throw storageInvalid()
    return ref
  }
  async function legacyPath(metadata) {
    // No production fallback to Render's local disk, even for legacy metadata.
    if (config.STORAGE_PROVIDER !== 'local') throw storageUnavailable()
    if (typeof metadata?.storagePath !== 'string' || path.extname(metadata.storagePath).toLowerCase() !== '.pdf') throw storageInvalid()
    const root = await realpath(path.resolve(config.RESUME_UPLOAD_DIR))
    const candidate = path.resolve(metadata.storagePath)
    if ((await lstat(candidate)).isSymbolicLink()) throw storageInvalid()
    const target = await realpath(candidate)
    const relative = path.relative(root, target)
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw storageInvalid()
    return target
  }
  const safeError = error => error instanceof AppError ? error : error?.code === 'ENOENT' ? storageMissing() : storageUnavailable()
  return {
    async store({ buffer, mimeType }) {
      const storageReference = await storage.store({ category, buffer, mimeType })
      reference({ storageReference })
      const storagePath = config.STORAGE_PROVIDER === 'local' ? path.resolve(config.RESUME_UPLOAD_DIR, storageReference.key.split('/').at(-1)) : undefined
      return { storageReference, ...(storagePath ? { storagePath } : {}) }
    },
    async read(metadata) {
      if (metadata?.storageReference) return storage.read(reference(metadata))
      let file
      try {
        file = await open(await legacyPath(metadata), 'r')
        const stat = await file.stat()
        if (!stat.isFile() || stat.size < 1 || stat.size > config.RESUME_MAX_FILE_SIZE_BYTES) throw storageInvalid()
        const buffer = Buffer.alloc(config.RESUME_MAX_FILE_SIZE_BYTES + 1)
        let size = 0
        while (size < buffer.length) {
          const { bytesRead } = await file.read(buffer, size, buffer.length - size, size)
          if (!bytesRead) break
          size += bytesRead
        }
        if (!size || size > config.RESUME_MAX_FILE_SIZE_BYTES) throw storageInvalid()
        return buffer.subarray(0, size)
      } catch (error) { throw safeError(error) }
      finally { await file?.close().catch(() => {}) }
    },
    async remove(metadata) {
      if (metadata?.storageReference) return storage.remove(reference(metadata))
      try { await unlink(await legacyPath(metadata)) }
      catch (error) { if (error?.code !== 'ENOENT') throw safeError(error) }
    },
  }
}

const runtimeStorage = new Map()
export function getPdfStorage(category) {
  if (!runtimeStorage.has(category)) runtimeStorage.set(category, createPdfStorage(env, category))
  return runtimeStorage.get(category)
}

// Call only after the existing domain authorization has resolved the metadata.
export async function sendPdfDownload(response, metadata, category, storage = getPdfStorage(category)) {
  const buffer = await storage.read(metadata)
  response.attachment(metadata.originalName)
  response.type(metadata.mimeType ?? 'application/pdf')
  return response.send(buffer)
}

export const ACADEMIC_PDF_CATEGORIES = Object.freeze({ class10: 'class10', class12: 'class12', collegeResult: 'college-result' })
export const DRIVE_PDF_CATEGORIES = Object.freeze({ companyRecruitmentInformation: 'company-recruitment-information', placementDriveJobDescription: 'drive-job-description', recruitmentProcessInstructions: 'recruitment-process-instructions' })

export function validatePdfUpload(file, message, maxBytes = env.RESUME_MAX_FILE_SIZE_BYTES) {
  const bytes = file?.buffer
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > maxBytes || file.mimetype !== 'application/pdf' || path.extname(file.originalname ?? '').toLowerCase() !== '.pdf' || !bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new AppError(message, { statusCode: 422, errorCode: 'VALIDATION_ERROR' })
  }
}

// The domain supplies the DB mutation, after authorization/workflow checks.
// Cleanup stays outside the save boundary so old-file failures cannot roll back a committed reference.
export async function persistPdfUpload(file, category, previous, save, dependencies = {}) {
  const storage = dependencies.pdfStorage ?? getPdfStorage(category)
  const metadata = { originalName: file.originalname, ...await storage.store({ buffer: file.buffer, mimeType: file.mimetype }), mimeType: file.mimetype, size: file.buffer.length, uploadedAt: dependencies.now ?? new Date() }
  const cleanup = async value => {
    try { await storage.remove(value) }
    catch { try { (dependencies.onCleanupFailure ?? (() => console.warn('PDF file cleanup failed.')))() } catch { /* Reporting cannot alter the save result. */ } }
  }
  let saved
  try { saved = await save(metadata) }
  catch (error) { await cleanup(metadata); throw error }
  if (previous?.storageReference || previous?.storagePath) await cleanup(previous)
  return saved
}
