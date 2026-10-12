import path from 'node:path'
import { mkdir, open, realpath, lstat, unlink } from 'node:fs/promises'
import { AppError } from '../errors/app-error.js'
import { newReference, referencePolicy, storageInvalid, storageMissing, storageUnavailable } from './storage-contract.js'

export function createLocalStorage(config) {
  async function target(reference, { create = false } = {}) {
    const policy = referencePolicy(config, 'local', reference)
    const root = path.resolve(policy.directory)
    if (create) await mkdir(root, { recursive: true })
    const resolvedRoot = await realpath(root)
    const filePath = path.join(resolvedRoot, policy.filename)
    if (!create) {
      if ((await lstat(filePath)).isSymbolicLink()) throw storageInvalid()
      if (path.dirname(await realpath(filePath)) !== resolvedRoot) throw storageInvalid()
    }
    return { ...policy, filePath }
  }
  const safeError = error => error instanceof AppError ? error : error?.code === 'ENOENT' ? storageMissing() : storageUnavailable()
  return Object.freeze({
    provider: 'local',
    async store(input) {
      const reference = newReference(config, 'local', input)
      let file
      let filePath
      try {
        filePath = (await target(reference, { create: true })).filePath
        file = await open(filePath, 'wx')
        await file.writeFile(input.buffer)
        return reference
      } catch (error) {
        if (file) { await file.close().catch(() => {}); file = undefined; await unlink(filePath).catch(() => {}) }
        throw safeError(error)
      } finally { await file?.close().catch(() => {}) }
    },
    async read(reference) {
      let file
      try {
        const { filePath, maxBytes } = await target(reference)
        file = await open(filePath, 'r')
        const stat = await file.stat()
        if (!stat.isFile() || stat.size < 1 || stat.size > maxBytes) throw storageInvalid()
        const buffer = Buffer.alloc(maxBytes + 1)
        let size = 0
        while (size < buffer.length) {
          const { bytesRead } = await file.read(buffer, size, buffer.length - size, size)
          if (!bytesRead) break
          size += bytesRead
        }
        if (!size || size > maxBytes) throw storageInvalid()
        return buffer.subarray(0, size)
      } catch (error) { throw safeError(error) }
      finally { await file?.close().catch(() => {}) }
    },
    async remove(reference) {
      try { await unlink((await target(reference)).filePath) }
      catch (error) { if (error.code !== 'ENOENT') throw safeError(error) }
    },
  })
}
