import multer from 'multer'
import path from 'node:path'
import { open, realpath, lstat, unlink } from 'node:fs/promises'
import { env } from '../../config/env.js'
import { AppError } from '../../errors/app-error.js'
import { createStorage } from '../../storage/storage.js'
import { storageConfigSchema } from '../../config/storage-config.js'
import { categoryPolicy, referencePolicy, storageInvalid, storageMissing, storageUnavailable } from '../../storage/storage-contract.js'
export { hasStoredImage } from '../../storage/image-metadata.js'

const invalid = message => new AppError(message, { statusCode: 422, errorCode: 'VALIDATION_ERROR' })
const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: env.SOCIAL_IMAGE_MAX_BYTES, files: 1, fields: 8 }, fileFilter: (request, file, next) => extensions[file.mimetype] ? next(null, true) : next(invalid('Use a JPEG, PNG, or WebP image.')) }).single('image')
export function socialImageUpload(request, response, next) {
  upload(request, response, error => next(error instanceof multer.MulterError ? invalid(error.code === 'LIMIT_FILE_SIZE' ? `Community images must be ${Math.round(env.SOCIAL_IMAGE_MAX_BYTES / 1024 / 1024)} MB or smaller.` : 'Upload one image in the image field.') : error))
}

export function validateImageFile(file, maxBytes = env.SOCIAL_IMAGE_MAX_BYTES) {
  if (!file) return
  if (!extensions[file.mimetype]) throw invalid('Use a JPEG, PNG, or WebP image.')
  if (!Buffer.isBuffer(file.buffer) || !file.buffer.length || file.buffer.length > maxBytes) throw invalid('Image is empty or exceeds the upload size limit.')
  const b = file.buffer
  const valid = file.mimetype === 'image/png' ? b.length >= 24 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && b.toString('ascii', 12, 16) === 'IHDR'
    : file.mimetype === 'image/jpeg' ? b.length >= 4 && b[0] === 255 && b[1] === 216 && b[2] === 255 && b.at(-2) === 255 && b.at(-1) === 217
      : b.length >= 16 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' && ['VP8 ', 'VP8L', 'VP8X'].includes(b.toString('ascii', 12, 16))
  if (!valid) throw invalid('Image contents do not match the selected file type.')
}

export function imagePath(image, directory = env.SOCIAL_UPLOAD_DIR) {
  if (!image?.filename || !/^[a-f\d-]{36}\.(jpg|png|webp)$/.test(image.filename)) throw invalid('Invalid community image reference.')
  const root = path.resolve(directory)
  const target = path.resolve(root, image.filename)
  if (path.dirname(target) !== root) throw invalid('Invalid community image reference.')
  return target
}

// Category-specific metadata compatibility over the existing E1 adapters.
// Legacy filenames are read in place; production never resolves them to local disk.
export function createImageStorage(input, category = 'feed-image', dependencies = {}) {
  if (!['feed-image', 'profile-avatar'].includes(category)) throw storageInvalid()
  const config = storageConfigSchema.parse(input)
  const policy = categoryPolicy(config, category)
  const storage = dependencies.storage ?? createStorage(config, dependencies)
  function reference(image) {
    const ref = image.storageReference?.toObject ? image.storageReference.toObject() : image.storageReference
    referencePolicy(config, config.STORAGE_PROVIDER, ref)
    if (!ref.key.startsWith(`2027/${category}/`)) throw storageInvalid()
    return ref
  }
  async function legacyPath(image) {
    if (config.STORAGE_PROVIDER !== 'local') throw storageUnavailable()
    const candidate = imagePath(image, policy.directory)
    const root = await realpath(path.resolve(policy.directory))
    if ((await lstat(candidate)).isSymbolicLink()) throw storageInvalid()
    const target = await realpath(candidate)
    if (path.dirname(target) !== root) throw storageInvalid()
    return target
  }
  const safeError = error => error instanceof AppError ? error : error?.code === 'ENOENT' ? storageMissing() : storageUnavailable()
  return {
    async store(file) {
      validateImageFile(file, config.SOCIAL_IMAGE_MAX_BYTES)
      if (!file) return undefined
      const storageReference = await storage.store({ category, buffer: file.buffer, mimeType: file.mimetype })
      reference({ storageReference })
      return { storageReference, ...(config.STORAGE_PROVIDER === 'local' ? { filename: storageReference.key.split('/').at(-1) } : {}), mimeType: file.mimetype, size: file.buffer.length }
    },
    async read(image) {
      if (image?.storageReference) return storage.read(reference(image))
      let file
      try {
        file = await open(await legacyPath(image), 'r')
        const stat = await file.stat()
        if (!stat.isFile() || !stat.size || stat.size > policy.maxBytes) throw storageInvalid()
        const buffer = Buffer.alloc(policy.maxBytes + 1)
        let size = 0
        while (size < buffer.length) {
          const { bytesRead } = await file.read(buffer, size, buffer.length - size, size)
          if (!bytesRead) break
          size += bytesRead
        }
        if (!size || size > policy.maxBytes) throw storageInvalid()
        return buffer.subarray(0, size)
      } catch (error) { throw safeError(error) }
      finally { await file?.close().catch(() => {}) }
    },
    async remove(image) {
      if (image?.storageReference) return storage.remove(reference(image))
      if (!image?.filename) return
      try { await unlink(await legacyPath(image)) }
      catch (error) { if (error?.code !== 'ENOENT') throw safeError(error) }
    },
  }
}

const runtimeStorage = new Map()
export function getImageStorage(category = 'feed-image', directory = env.SOCIAL_UPLOAD_DIR) {
  const cacheKey = `${category}:${path.resolve(directory)}`
  if (!runtimeStorage.has(cacheKey)) runtimeStorage.set(cacheKey, createImageStorage({ ...env, SOCIAL_UPLOAD_DIR: directory }, category))
  return runtimeStorage.get(cacheKey)
}
export const storeImage = (file, directory = env.SOCIAL_UPLOAD_DIR) => file ? getImageStorage('feed-image', directory).store(file) : undefined
export const readImage = image => getImageStorage().read(image)
export const removeImage = (image, directory = env.SOCIAL_UPLOAD_DIR) => getImageStorage('feed-image', directory).remove(image)
export const storeAvatar = file => file ? getImageStorage('profile-avatar').store(file) : undefined
export const readAvatar = image => getImageStorage('profile-avatar').read(image)
export const removeAvatar = image => getImageStorage('profile-avatar').remove(image)

// Cleanup is best effort after a commit and cannot replace the original save error.
export async function cleanupImage(image, remove, dependencies = {}) {
  if (!image?.filename && !image?.storageReference) return
  try { await remove(image) }
  catch { reportImageCleanupFailure(dependencies) }
}
export function reportImageCleanupFailure(dependencies = {}) {
  try { (dependencies.onCleanupFailure ?? (() => console.warn('Community image cleanup failed.')))() } catch { /* Reporting cannot alter the operation result. */ }
}
