export const DATABASE_STARTUP_TIMEOUT_MS = 15000

export class DatabaseStartupError extends Error {
  constructor(category) {
    super('Production database connection failed.')
    this.name = 'DatabaseStartupError'
    this.category = category
  }
}

function failureCategory(error) {
  const pending = [error]
  const seen = new Set()
  let fallback = 'DATABASE_CONNECTION_FAILURE'
  while (pending.length && seen.size < 32) {
    const current = pending.shift()
    if (!current || typeof current !== 'object' || seen.has(current)) continue
    seen.add(current)
    if (['ENOTFOUND', 'EAI_AGAIN', 'ENODATA', 'ESERVFAIL', 'ETIMEOUT'].includes(current.code)
      || ['querySrv', 'queryTxt'].includes(current.syscall)) return 'DNS_FAILURE'
    if (current.code === 18 || current.name === 'MongoAuthenticationError') return 'AUTHENTICATION_FAILURE'
    if (typeof current.code === 'string' && /^(ERR_TLS_|ERR_SSL_|CERT_|DEPTH_ZERO_SELF_SIGNED_CERT|UNABLE_TO_VERIFY_LEAF_SIGNATURE)/.test(current.code)) return 'TLS_FAILURE'
    if (current.name === 'MongoParseError' || current.name === 'MongoInvalidArgumentError') return 'CONNECTION_CONFIGURATION_FAILURE'
    if (['MongoNetworkTimeoutError'].includes(current.name) || current.code === 'ETIMEDOUT') fallback = 'CONNECT_TIMEOUT'
    else if (['ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH'].includes(current.code)) fallback = 'NETWORK_FAILURE'
    else if (['MongoServerSelectionError', 'MongooseServerSelectionError'].includes(current.name)
      && fallback === 'DATABASE_CONNECTION_FAILURE') fallback = 'SERVER_SELECTION_FAILURE'
    pending.push(current.cause, current.reason)
    if (current.servers instanceof Map) {
      for (const server of current.servers.values()) pending.push(server.error)
    }
  }
  return fallback
}

// Covers DNS resolution before the driver's server-selection clock starts.
// server.js exits on rejection, terminating any still-pending driver/DNS work.
export async function withDatabaseStartupDeadline(connect, timeoutMs = DATABASE_STARTUP_TIMEOUT_MS) {
  let timer
  try {
    await Promise.race([
      Promise.resolve().then(connect),
      new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new DatabaseStartupError('STARTUP_TIMEOUT')), timeoutMs)
      }),
    ])
  } catch (error) {
    throw error instanceof DatabaseStartupError ? error : new DatabaseStartupError(failureCategory(error))
  } finally {
    clearTimeout(timer)
  }
}
