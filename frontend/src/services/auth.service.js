import { apiRequest } from './api-client.js'

export function registerAccount(input) {
  return apiRequest('/auth/register', { method: 'POST', body: JSON.stringify(input) })
}

export function loginAccount(input) {
  return apiRequest('/auth/login', { method: 'POST', body: JSON.stringify(input) })
}

export function getCurrentUser(accessToken) {
  return apiRequest('/auth/me', { headers: { Authorization: `Bearer ${accessToken}` } })
}
