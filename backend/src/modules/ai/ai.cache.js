import { assertAiRuntime } from './ai.guard.js'

// Adapter surface can later be implemented by a 2027-only persistent store.
export function createMemoryCache(config, { now = Date.now } = {}) {
  assertAiRuntime(config)
  const entries = new Map()
  return {
    get(key) {
      assertAiRuntime(config)
      const entry = entries.get(key)
      if (!entry) return undefined
      if (entry.expiresAt <= now()) { entries.delete(key); return undefined }
      return structuredClone(entry.value)
    },
    set(key, value) {
      assertAiRuntime(config)
      for (const [id, entry] of entries) if (entry.expiresAt <= now()) entries.delete(id)
      entries.delete(key)
      while (entries.size >= config.AI_CACHE_MAX_ENTRIES) entries.delete(entries.keys().next().value)
      entries.set(key, { value: structuredClone(value), expiresAt: now() + config.AI_CACHE_TTL_MS })
    },
  }
}
