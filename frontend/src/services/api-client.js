import { activePlacementCycle, apiUrlForPlacementCycle } from '../features/placement-cycle/placement-cycle.js'

// Existing download helpers interpolate this value into URLs. Its string value
// resolves at request time, so those helpers follow the active cycle too.
export const API_URL = Object.freeze({ toString: () => apiUrlForPlacementCycle(activePlacementCycle()) })

export async function apiRequest(path, options = {}) {
  const headers = { Accept: 'application/json', ...options.headers }
  const isFormData = options.body instanceof FormData
  const jsonBody = options.body && typeof options.body === 'object' && !isFormData

  if (options.body && !isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(`${apiUrlForPlacementCycle(activePlacementCycle())}${path}`, {
    ...options,
    headers,
    body: jsonBody ? JSON.stringify(options.body) : options.body,
  })
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const error = new Error(payload?.message ?? 'The request could not be completed.')
    error.statusCode = response.status
    error.errorCode = payload?.errorCode
    error.details = payload?.details
    throw error
  }
  return payload
}
