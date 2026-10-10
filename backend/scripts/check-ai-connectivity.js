// Opt-in manual check; never imported or run by automated tests. No DB connection.
import dotenv from 'dotenv'
dotenv.config({ path: '.env.cycle-2027', override: true, quiet: true })
const { env } = await import('../src/config/env.js')
const { assertAiRuntime } = await import('../src/modules/ai/ai.guard.js')
assertAiRuntime(env)
const { createAiProvider, providerIdentity } = await import('../src/modules/ai/providers/ai.provider.js')
const label = `LIVE_${env.AI_PROVIDER.toUpperCase()}_CHECK`
if (!env.AI_ENABLED || !providerIdentity(env).configured) {
  console.info(`${label}: skipped (selected provider is disabled or not configured).`)
} else {
  const { validateAnalysis, analysisJsonSchema } = await import('../src/modules/ai/ai.schemas.js')
  try {
    const provider = createAiProvider(env)
    validateAnalysis(await provider.generate({ system: 'Return only the requested JSON. This is a synthetic connectivity check.', prompt: 'Set summary to Connectivity confirmed. Return empty arrays for strengths, gaps and recommendations.', jsonSchema: analysisJsonSchema }))
    console.info(`${label}: passed (one synthetic request; no Student/Company data).`)
  } catch (error) {
    console.info(`${label}: failed (${['timeout', 'quota', 'busy', 'invalid_output', 'output_limit', 'unavailable', 'not_configured'].includes(error.code) ? error.code : 'unavailable'}).`)
    process.exitCode = 1
  }
}
