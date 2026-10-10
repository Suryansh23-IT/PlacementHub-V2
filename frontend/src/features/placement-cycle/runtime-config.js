// Public values only. Deployment mode is explicit; never inferred from the hostname.
export function createFrontendRuntime(env, productionBuild = false) {
  const mode = env.VITE_APP_MODE ?? (productionBuild ? 'public' : 'local')
  if (!['local', 'public'].includes(mode)) throw new Error('VITE_APP_MODE must be local or public.')
  if (env.VITE_AI_ENABLED !== undefined && !['true', 'false'].includes(env.VITE_AI_ENABLED)) throw new Error('VITE_AI_ENABLED must be true or false.')
  const publicMode = mode === 'public'
  if (publicMode && env.VITE_AI_ENABLED === 'true') throw new Error('Public AI must remain disabled.')
  const api2027 = env.VITE_API_URL_2027 ?? (publicMode ? '/api/v1' : 'http://localhost:5001/api/v1')
  if (publicMode && !api2027.startsWith('/')) {
    let url
    try { url = new URL(api2027) } catch { throw new Error('Public VITE_API_URL_2027 must be an HTTPS URL or relative API path.') }
    if (url.protocol !== 'https:' || /^(localhost|127\..*|\[::1\]|0\.0\.0\.0)$/i.test(url.hostname) || url.username || url.password || url.search || url.hash) throw new Error('Public VITE_API_URL_2027 must use HTTPS without local addresses, credentials, query or fragment.')
  }
  if (publicMode && (api2027.startsWith('//') || !api2027.trim())) throw new Error('Invalid public API path.')
  return {
    mode, archiveEnabled: !publicMode,
    aiEnabled: !publicMode && env.VITE_AI_ENABLED !== 'false',
    api2026: publicMode ? undefined : env.VITE_API_URL_2026 ?? 'http://localhost:5000/api/v1',
    api2027,
  }
}
