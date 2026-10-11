import { StorageClient } from '@supabase/storage-js'
import { AppError } from '../errors/app-error.js'
import { newReference, referencePolicy, storageInvalid, storageMissing, storageUnavailable } from './storage-contract.js'

export function createSupabaseStorage(config, { client, fetch: fetchImplementation = globalThis.fetch } = {}) {
  async function boundedFetch(url, options) {
    const response = await fetchImplementation(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(config.STORAGE_TIMEOUT_MS), cache: 'no-store' })
    const maxBytes = Math.max(config.RESUME_MAX_FILE_SIZE_BYTES, config.SOCIAL_IMAGE_MAX_BYTES, 65536)
    const reader = response.body?.getReader()
    const chunks = []
    let size = 0
    try {
      if (Number(response.headers.get('content-length')) > maxBytes) throw storageUnavailable()
      while (reader) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > maxBytes) throw storageUnavailable()
        chunks.push(Buffer.from(value))
      }
      return new Response(size ? Buffer.concat(chunks, size) : null, { status: response.status, statusText: response.statusText, headers: response.headers })
    } catch {
      await reader?.cancel().catch(() => {})
      throw storageUnavailable()
    } finally { reader?.releaseLock() }
  }
  // Secret API keys go only in apikey, never in Authorization as a non-JWT bearer token.
  const storage = client ?? new StorageClient(`${config.SUPABASE_URL.replace(/\/$/, '')}/storage/v1`, { apikey: config.SUPABASE_SECRET_KEY }, boundedFetch)
  async function bucket() {
    try {
      const { data, error } = await storage.getBucket(config.SUPABASE_STORAGE_BUCKET)
      if (error || data?.id !== config.SUPABASE_STORAGE_BUCKET || data?.public !== false) throw storageUnavailable()
      return storage.from(config.SUPABASE_STORAGE_BUCKET)
    } catch { throw storageUnavailable() }
  }
  function checkError(error) {
    if (!error) return
    if (String(error.statusCode) === '404') throw storageMissing()
    throw storageUnavailable()
  }
  async function safely(action) {
    try { return await action() }
    catch (error) {
      // Do not propagate SDK errors, credentials, URLs or object keys into API logs/responses.
      if (error instanceof AppError) throw error
      throw storageUnavailable()
    }
  }
  return Object.freeze({
    provider: 'supabase',
    async store(input) {
      const reference = newReference(config, 'supabase', input)
      return safely(async () => {
        const { error } = await (await bucket()).upload(reference.key, input.buffer, { contentType: input.mimeType, upsert: false })
        checkError(error)
        return reference
      })
    },
    async read(reference) {
      const { maxBytes } = referencePolicy(config, 'supabase', reference)
      return safely(async () => {
        const { data, error } = await (await bucket()).download(reference.key)
        checkError(error)
        if (!data || data.size < 1 || data.size > maxBytes) throw storageInvalid()
        const buffer = Buffer.from(await data.arrayBuffer())
        if (!buffer.length || buffer.length > maxBytes) throw storageInvalid()
        return buffer
      })
    },
    async remove(reference) {
      referencePolicy(config, 'supabase', reference)
      return safely(async () => {
        const { error } = await (await bucket()).remove([reference.key])
        if (String(error?.statusCode) !== '404') checkError(error)
      })
    },
  })
}
