import path from 'node:path'
import { open, realpath, lstat, unlink } from 'node:fs/promises'
import { env } from '../../config/env.js'
import { AppError } from '../../errors/app-error.js'
import { createStorage } from '../../storage/storage.js'
import { storageConfigSchema } from '../../config/storage-config.js'
import { referencePolicy, storageInvalid, storageMissing, storageUnavailable } from '../../storage/storage-contract.js'

export function publicResumeMetadata(resume) {
  if (!resume) return undefined
  const { originalName, mimeType, size, uploadedAt } = resume.toObject ? resume.toObject() : resume
  return { originalName, mimeType, size, uploadedAt }
}

export function createResumeStorage(input, dependencies = {}) {
  const config = storageConfigSchema.parse(input)
  const storage = dependencies.storage ?? createStorage(config, dependencies)
  function reference(resume) {
    const ref = resume.storageReference?.toObject ? resume.storageReference.toObject() : resume.storageReference
    referencePolicy(config, config.STORAGE_PROVIDER, ref)
    if (!ref.key.startsWith('2027/resume/')) throw storageInvalid()
    return ref
  }
  async function legacyPath(resume) {
    // No production fallback to Render's local disk, even for legacy metadata.
    if (config.STORAGE_PROVIDER !== 'local') throw storageUnavailable()
    if (typeof resume?.storagePath !== 'string' || path.extname(resume.storagePath).toLowerCase() !== '.pdf') throw storageInvalid()
    const root = await realpath(path.resolve(config.RESUME_UPLOAD_DIR))
    const candidate = path.resolve(resume.storagePath)
    if ((await lstat(candidate)).isSymbolicLink()) throw storageInvalid()
    const target = await realpath(candidate)
    const relative = path.relative(root, target)
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw storageInvalid()
    return target
  }
  const safeError = error => error instanceof AppError ? error : error?.code === 'ENOENT' ? storageMissing() : storageUnavailable()
  return {
    async store({ buffer, mimeType }) {
      const storageReference = await storage.store({ category: 'resume', buffer, mimeType })
      reference({ storageReference })
      const storagePath = config.STORAGE_PROVIDER === 'local' ? path.resolve(config.RESUME_UPLOAD_DIR, storageReference.key.split('/').at(-1)) : undefined
      return { storageReference, ...(storagePath ? { storagePath } : {}) }
    },
    async read(resume) {
      if (resume?.storageReference) return storage.read(reference(resume))
      let file
      try {
        file = await open(await legacyPath(resume), 'r')
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
    async remove(resume) {
      if (resume?.storageReference) return storage.remove(reference(resume))
      try { await unlink(await legacyPath(resume)) }
      catch (error) { if (error?.code !== 'ENOENT') throw safeError(error) }
    },
  }
}

let runtimeStorage
export const getResumeStorage = () => runtimeStorage ??= createResumeStorage(env)

// Controllers call this only after their existing role/domain authorization.
export async function sendResumeDownload(response, resume, storage = getResumeStorage()) {
  const buffer = await storage.read(resume)
  response.attachment(resume.originalName)
  response.type(resume.mimeType ?? 'application/pdf')
  return response.send(buffer)
}
