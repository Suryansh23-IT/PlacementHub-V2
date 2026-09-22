const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api/v1'

export async function apiRequest(path, options = {}) {
  const headers = { Accept: 'application/json', ...options.headers }

  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(`${API_URL}${path}`, {
    headers,
    ...options,
  })
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const error = new Error(payload?.message ?? 'The request could not be completed.')
    error.statusCode = response.status
    error.errorCode = payload?.errorCode
    throw error
  }
  return payload
}
