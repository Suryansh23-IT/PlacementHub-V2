import { randomUUID } from 'node:crypto'
import { AppError } from '../errors/app-error.js'

const pdfCategories = ['resume', 'class10', 'class12', 'college-result', 'participation-letter', 'company-recruitment-information', 'drive-job-description', 'recruitment-process-instructions', 'phase-instruction', 'placement-proof']
export const STORAGE_CATEGORIES = Object.freeze([...pdfCategories, 'feed-image', 'profile-avatar'])
const imageExtensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
export const storageInvalid = () => new AppError('Invalid file storage request.', { statusCode: 422, errorCode: 'VALIDATION_ERROR' })
export const storageMissing = () => new AppError('File was not found.', { statusCode: 404, errorCode: 'NOT_FOUND' })
export const storageUnavailable = () => new AppError('File storage is unavailable.', { statusCode: 503, errorCode: 'STORAGE_UNAVAILABLE' })

export function categoryPolicy(config, category) {
  if (!STORAGE_CATEGORIES.includes(category)) throw storageInvalid()
  const pdf = pdfCategories.includes(category)
  return {
    directory: pdf ? config.RESUME_UPLOAD_DIR : category === 'profile-avatar' ? `${config.SOCIAL_UPLOAD_DIR}/profile-avatars` : config.SOCIAL_UPLOAD_DIR,
    maxBytes: pdf ? config.RESUME_MAX_FILE_SIZE_BYTES : config.SOCIAL_IMAGE_MAX_BYTES,
    extensions: pdf ? { 'application/pdf': 'pdf' } : imageExtensions,
  }
}

export function newReference(config, provider, { category, buffer, mimeType, key }) {
  const policy = categoryPolicy(config, category)
  const extension = Object.hasOwn(policy.extensions, mimeType) ? policy.extensions[mimeType] : undefined
  // Domain services retain signature validation and authorization before calling store.
  if (!extension || !Buffer.isBuffer(buffer) || !buffer.length || buffer.length > policy.maxBytes) throw storageInvalid()
  const reference = { provider, key: key ?? `2027/${category}/${randomUUID()}.${extension}` }
  referencePolicy(config, provider, reference)
  if (!reference.key.startsWith(`2027/${category}/`) || !reference.key.endsWith(`.${extension}`)) throw storageInvalid()
  return Object.freeze(reference)
}

export function referencePolicy(config, provider, reference) {
  if (!reference || reference.provider !== provider || typeof reference.key !== 'string') throw storageInvalid()
  const match = /^2027\/([a-z0-9-]+)\/([a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}\.(pdf|jpg|png|webp))$/.exec(reference.key)
  if (!match || match[0] !== reference.key) throw storageInvalid()
  const policy = categoryPolicy(config, match[1])
  if (!Object.values(policy.extensions).includes(match[3])) throw storageInvalid()
  return { ...policy, filename: match[2] }
}
