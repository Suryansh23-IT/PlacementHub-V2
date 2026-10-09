import multer from 'multer'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import { env } from '../../config/env.js'
import { AppError } from '../../errors/app-error.js'

const invalid = message => new AppError(message, { statusCode: 422, errorCode: 'VALIDATION_ERROR' })
const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: env.SOCIAL_IMAGE_MAX_BYTES, files: 1, fields: 8 }, fileFilter: (request, file, next) => extensions[file.mimetype] ? next(null, true) : next(invalid('Use a JPEG, PNG, or WebP image.')) }).single('image')
export function socialImageUpload(request, response, next) {
  upload(request, response, error => next(error instanceof multer.MulterError ? invalid(error.code === 'LIMIT_FILE_SIZE' ? `Community images must be ${Math.round(env.SOCIAL_IMAGE_MAX_BYTES / 1024 / 1024)} MB or smaller.` : 'Upload one image in the image field.') : error))
}

export function validateImageFile(file, maxBytes = env.SOCIAL_IMAGE_MAX_BYTES) {
  if (!file) return
  if (!extensions[file.mimetype]) throw invalid('Use a JPEG, PNG, or WebP image.')
  if (!file.buffer?.length || file.buffer.length > maxBytes) throw invalid('Image is empty or exceeds the upload size limit.')
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

export async function storeImage(file, directory = env.SOCIAL_UPLOAD_DIR) {
  validateImageFile(file)
  if (!file) return undefined
  const image = { filename: `${randomUUID()}.${extensions[file.mimetype]}`, mimeType: file.mimetype, size: file.buffer.length }
  await mkdir(path.resolve(directory), { recursive: true })
  await writeFile(imagePath(image, directory), file.buffer, { flag: 'wx' })
  return image
}

export async function removeImage(image, directory = env.SOCIAL_UPLOAD_DIR) {
  if (!image?.filename) return
  try { await unlink(imagePath(image, directory)) } catch (error) { if (error.code !== 'ENOENT') throw error }
}
