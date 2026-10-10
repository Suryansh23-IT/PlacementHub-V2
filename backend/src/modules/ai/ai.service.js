import { createAiRuntime } from './ai-runtime.js'
import { AppError } from '../../errors/app-error.js'
import { assertAiRuntime } from './ai.guard.js'
import { AiProviderError, unavailable } from './ai.errors.js'
import { buildSafeContext, canonicalJson, fingerprint } from './ai.context.js'
import { createMemoryCache } from './ai.cache.js'
import { createAiProvider, providerIdentity } from './providers/ai.provider.js'
import { analysisJsonSchema, validateAnalysis, constrainEvidenceSchema } from './ai.schemas.js'
import { buildPrompt, PROMPT_VERSION, RESPONSE_VERSION, SYSTEM_INSTRUCTION } from './ai.prompts.js'

export function getAiStatus(config) {
  assertAiRuntime(config)
  const { provider, model, configured } = providerIdentity(config)
  return { enabled: config.AI_ENABLED, configured, provider, model: model ?? null, status: !config.AI_ENABLED ? 'disabled' : configured ? 'configured' : 'unavailable' }
}

export function createAiService(config, { providerFactory = createAiProvider, cacheFactory = createMemoryCache, now = Date.now } = {}) {
  assertAiRuntime(config)
  let provider; let cache; let cooldownUntil = 0
  const runtime = createAiRuntime(config, { now })
  const pending = new Map()
  runtime.registerQueue({ count: () => 0, cancel: () => { pending.clear(); cooldownUntil = 0 } })
  // Internal only. Future domain controllers supply a fresh authorization check
  // and read-only context loader; neither is accepted from an HTTP request.
  return {
    runtimeStatus: () => ({ ...runtime.status(), provider: providerIdentity(config).provider, model: providerIdentity(config).model }),
    resetRuntime: () => { runtime.reset(); cooldownUntil = 0; pending.clear(); return runtime.status() },
    runtimeEpoch: () => runtime.epoch(),
    registerQueue: queue => runtime.registerQueue(queue),
    isCurrent: result => result.runtimeEpoch === undefined || result.runtimeEpoch === runtime.epoch(),
    availability: () => ({ active: runtime.active(), cooldownMs: Math.max(0, cooldownUntil - now()) }),
    async analyze({ actor, scope, authorize, loadContext, kind = 'professional', resumeDependent = false, scoringVersion = 'none', enrichContext = value => value, contract, cacheOnly = false, forceRefresh = false }) {
      assertAiRuntime(config)
      if (!actor?._id || !['student', 'company', 'placement_admin'].includes(actor.role) || typeof authorize !== 'function') throw new AppError('AI authorization is required.', { statusCode: 403, errorCode: 'FORBIDDEN' })
      const checkAccess = async () => { if (await authorize(actor, scope) !== true) throw new AppError('AI analysis access is forbidden.', { statusCode: 403, errorCode: 'FORBIDDEN' }) }
      const requestEpoch = runtime.epoch()
      await checkAccess()
      if (!config.AI_ENABLED) return unavailable('disabled')
      const selected = providerIdentity(config)
      if (!selected.configured) return unavailable('not_configured')
      const safe = buildSafeContext(await loadContext(), { kind, resumeDependent })
      // Trusted domain extension only; routes never accept context/contracts.
      const context = enrichContext(safe.context)
      const { resumeRevision } = safe
      if (Buffer.byteLength(canonicalJson(context)) > config.AI_MAX_CONTEXT_BYTES) return unavailable('context_limit')
      const key = fingerprint({ actor: String(actor._id), role: actor.role, scope, context, resumeRevision, scoringVersion, promptVersion: PROMPT_VERSION, responseVersion: contract?.version ?? RESPONSE_VERSION, provider: selected, outputBudget: config.AI_MAX_OUTPUT_TOKENS })
      if (!cache) {
        try { cache = cacheFactory(config, { now }) } catch { cache = { get: () => undefined, set: () => {} } }
      }
      let cached
      try { cached = await cache.get(key) } catch { /* Optional cache must not break analysis. */ }
      if (cached && !forceRefresh) { await checkAccess(); return { status: 'available', analysis: cached, cached: true } }
      if (cacheOnly) return unavailable('not_cached')
      if (pending.has(key)) { const result = await pending.get(key); await checkAccess(); return result.runtimeEpoch !== undefined && result.runtimeEpoch !== runtime.epoch() ? unavailable('cancelled') : structuredClone(result) }
      if (requestEpoch !== runtime.epoch()) return unavailable('cancelled')
      if (now() < cooldownUntil) return unavailable('cooldown')
      if (runtime.active() >= config.AI_MAX_CONCURRENT) return unavailable('busy')
      const task = (async () => {
        const generation = runtime.epoch(); let timer
        try {
          provider ??= providerFactory(config)
          const output = await runtime.run(scope, async signal => {
            const deadline = new Promise((resolve, reject) => { timer = setTimeout(() => { reject(new AiProviderError('timeout')) }, config.AI_TIMEOUT_MS) })
            return await Promise.race([provider.generate({ system: `${SYSTEM_INSTRUCTION} ${contract?.instruction ?? ''}`, prompt: buildPrompt(context), jsonSchema: constrainEvidenceSchema(contract?.jsonSchema ?? analysisJsonSchema, context), signal }), deadline])
          })
          const analysis = contract ? contract.validate(output, context) : validateAnalysis(output, context.evidence.map(entry => entry.id))
          // Recheck after a slow provider request, before exposing or caching output.
          await checkAccess()
          if (generation !== runtime.epoch()) return unavailable('cancelled')
          try { await cache.set(key, analysis) } catch { /* Cache write is optional. */ }
          if (generation !== runtime.epoch()) return unavailable('cancelled')
          return { status: 'available', analysis, cached: false, runtimeEpoch: generation }
        } catch (error) {
          if (error instanceof AppError) throw error
          const safeReasons = ['not_configured', 'timeout', 'quota', 'busy', 'unavailable', 'invalid_output', 'invalid_evidence', 'output_limit', 'cancelled']
          const reason = error instanceof AiProviderError && safeReasons.includes(error.code) ? error.code : 'unavailable'
          if (generation === runtime.epoch() && ['quota', 'timeout', 'unavailable'].includes(reason)) cooldownUntil = now() + config.AI_COOLDOWN_MS
          return unavailable(reason)
        } finally { clearTimeout(timer) }
      })()
      pending.set(key, task)
      try { return structuredClone(await task) } finally { if (pending.get(key) === task) pending.delete(key) }
    },
  }
}
