import { assertAiRuntime } from '../ai.guard.js'
import { AiProviderError } from '../ai.errors.js'
import { createOllamaProvider } from './ollama.provider.js'

export function providerIdentity(config) {
  const provider = config.AI_PROVIDER ?? 'ollama'
  if (provider === 'ollama') return { provider, model: config.OLLAMA_MODEL, endpoint: config.OLLAMA_BASE_URL, contextWindow: config.OLLAMA_NUM_CTX ?? 8192, configured: Boolean(config.OLLAMA_BASE_URL && config.OLLAMA_MODEL) }
  return { provider, configured: false }
}

// Exactly one manually selected provider; no external/paid failover.
export function createAiProvider(config) {
  assertAiRuntime(config)
  if ((config.AI_PROVIDER ?? 'ollama') !== 'ollama') throw new AiProviderError('not_configured')
  return createOllamaProvider(config)
}
