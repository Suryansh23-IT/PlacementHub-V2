import { StorageClient } from '@supabase/storage-js'
import { AsyncLocalStorage } from 'node:async_hooks'
import { newReference, referencePolicy, storageInvalid as invalid, storageMissing as missing, storageUnavailable as unavailable } from './storage-contract.js'

export function createSupabaseStorage(config, { client, fetch: fetchImplementation = globalThis.fetch } = {}) {
  const trustedErrors = new WeakSet()
  const operation = new AsyncLocalStorage()
  const trusted = factory => () => { const error = factory(); trustedErrors.add(error); return error }
  const storageInvalid = trusted(invalid)
  const storageMissing = trusted(missing)
  const storageUnavailable = trusted(unavailable)
  async function withDeadline(action, onTimeout = () => {}) {
    let timer
    const controller = new AbortController()
    try {
      return await Promise.race([Promise.resolve().then(() => action(controller.signal)), new Promise((resolve, reject) => {
        timer = setTimeout(() => { controller.abort(); onTimeout(); reject(storageUnavailable()) }, config.STORAGE_TIMEOUT_MS)
      })])
    } finally { clearTimeout(timer) }
  }
  async function boundedFetch(url, options) {
    const controller = new AbortController()
    let reader
    const signal = AbortSignal.any([controller.signal, operation.getStore()].filter(Boolean))
    const cancel = () => { void reader?.cancel().catch(() => {}) }
    signal.addEventListener('abort', cancel, { once: true })
    try { return await withDeadline(async () => {
      signal.throwIfAborted()
      const response = await fetchImplementation(url, { ...options, redirect: 'error', signal, cache: 'no-store' })
      signal.throwIfAborted()
      const maxBytes = Math.max(config.RESUME_MAX_FILE_SIZE_BYTES, config.SOCIAL_IMAGE_MAX_BYTES, 65536)
      reader = response.body?.getReader()
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
        signal.throwIfAborted()
        return new Response(size ? Buffer.concat(chunks, size) : null, { status: response.status, statusText: response.statusText, headers: response.headers })
      } catch {
        void reader?.cancel().catch(() => {})
        throw storageUnavailable()
      } finally { reader?.releaseLock() }
    }, () => { controller.abort(); cancel() }) }
    finally { signal.removeEventListener('abort', cancel) }
  }
  // Secret API keys go only in apikey, never in Authorization as a non-JWT bearer token.
  const storage = client ?? new StorageClient(`${config.SUPABASE_URL.replace(/\/$/, '')}/storage/v1`, { apikey: config.SUPABASE_SECRET_KEY }, boundedFetch)
  async function bucket() {
    try {
      const { data, error } = await storage.getBucket(config.SUPABASE_STORAGE_BUCKET)
      operation.getStore()?.throwIfAborted()
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
    try { return await withDeadline(signal => operation.run(signal, action)) }
    catch (error) {
      // Do not propagate SDK errors, credentials, URLs or object keys into API logs/responses.
      if (trustedErrors.has(error)) throw error
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
