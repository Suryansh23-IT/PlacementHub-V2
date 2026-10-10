import { assertAiRuntime } from '../ai.guard.js'
import { AiProviderError } from '../ai.errors.js'
import { boundedBody } from './provider-body.js'

export function createOllamaProvider(config, { fetchImpl = globalThis.fetch } = {}) {
  assertAiRuntime(config)
  return {
    async generate({ system, prompt, jsonSchema, signal }) {
      assertAiRuntime(config)
      if (!config.AI_ENABLED || !config.OLLAMA_MODEL || !config.OLLAMA_BASE_URL) throw new AiProviderError('not_configured')
      const timeout = AbortSignal.timeout(config.AI_TIMEOUT_MS)
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
      try {
        const base = new URL(config.OLLAMA_BASE_URL)
        if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash || base.pathname !== '/') throw new AiProviderError('not_configured')
        const response = await fetchImpl(`${base.origin}/api/chat`, {
          method: 'POST', redirect: 'error', signal: combined, headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: config.OLLAMA_MODEL, think: false, stream: false, keep_alive: '10m', format: jsonSchema,
            options: { temperature: 0, seed: 42, num_ctx: config.OLLAMA_NUM_CTX ?? 8192, num_predict: Math.min(config.AI_MAX_OUTPUT_TOKENS, 1024) },
            messages: [{ role: 'system', content: `${system} Keep answers concise. Learning suggestions are allowed with incomplete evidence; label suggestions as advice, not facts about the person. Do not require verification or eligibility to give preparation advice. For absent evidence say "not documented", never "you lack", "cannot" or a proven weakness. No invented evidence references.` }, { role: 'user', content: prompt }],
          }),
        })
        if (!response.ok) { await response.body?.cancel(); throw new AiProviderError(response.status === 429 ? 'quota' : response.status === 503 ? 'busy' : 'unavailable') }
        const body = await boundedBody(response, config.AI_MAX_RESPONSE_BYTES)
        if (body.done !== true || body.done_reason !== 'stop') throw new AiProviderError(body.done_reason === 'length' ? 'output_limit' : 'invalid_output')
        if (typeof body.message?.content !== 'string' || body.message.thinking || body.message.tool_calls?.length) throw new AiProviderError('invalid_output')
        // Local models sometimes phrase absent documentation as an actual lack.
        // Normalize that wording in prose only, never IDs, ratings or scores.
        return JSON.parse(body.message.content, (key, value) => {
          if (['summary', 'answer', 'text', 'reason'].includes(key) && typeof value === 'string') return value.replace(/\blacks\b/gi, 'does not document').replace(/\black of(?: documented)?\b/gi, 'absence of documented').replace(/\byou (?:do not|don't)(?: yet)? (?:possess|have|know)\b/gi, 'your available evidence does not document').replace(/\byou lack\b/gi, 'you do not document')
          return value
        })
      } catch (error) {
        if (combined.aborted) throw new AiProviderError('timeout')
        if (error instanceof AiProviderError) throw error
        throw new AiProviderError(error instanceof SyntaxError ? 'invalid_output' : 'unavailable')
      }
    },
  }
}
