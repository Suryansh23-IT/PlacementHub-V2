import { storageConfigSchema } from '../config/storage-config.js'
import { createLocalStorage } from './local-storage.js'
import { createSupabaseStorage } from './supabase-storage.js'

/**
 * Internal backend interface, to be wired into domain services in a later checkpoint.
 * store({ category, buffer, mimeType, key? }) -> internal { provider, key }
 * Optional validated key is for internal, deterministic migration retries only; never HTTP input.
 * read(reference) -> bounded Buffer; remove(reference) -> void (missing is idempotent).
 * Callers must authorize the domain operation and validate file signatures first.
 * References are server-generated and must never be accepted from HTTP input or returned in DTOs.
 * Construction performs no filesystem writes or network calls. No provider fallback.
 */
export function createStorage(config, dependencies = {}) {
  const parsed = storageConfigSchema.safeParse(config)
  if (!parsed.success) {
    // Never attach raw Zod issues/config: these may contain credentials.
    throw new Error('Invalid storage configuration.')
  }
  return parsed.data.STORAGE_PROVIDER === 'local' ? createLocalStorage(parsed.data) : createSupabaseStorage(parsed.data, dependencies)
}
