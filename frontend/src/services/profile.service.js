import { apiRequest, API_URL } from './api-client.js'
export const getSocialProfile = (token, id) => apiRequest(`/social/profiles/${id}`, { headers: { Authorization: `Bearer ${token}` } })
export const getStudentMainProfile = (token, id) => apiRequest(`/social/profiles/${id}/main-profile`, { headers: { Authorization: `Bearer ${token}` } })

export async function getProfileAvatar(token, id) {
  const response = await fetch(`${API_URL}/social/profiles/${id}/avatar`, { headers: { Authorization: `Bearer ${token}` } })
  if (!response.ok) throw new Error('Profile image unavailable.')
  return response.blob()
}
export function updateSocialProfile(token, id, input, image, removeImage) {
  let body = { ...input, ...(removeImage ? { removeImage: true } : {}) }
  if (image || removeImage) {
    body = new FormData()
    for (const [key, value] of Object.entries(input)) if (value !== undefined) body.append(key, typeof value === 'object' ? JSON.stringify(value) : value)
    if (image) body.append('image', image)
    if (removeImage) body.append('removeImage', 'true')
  }
  return apiRequest(`/social/profiles/${id}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` }, body })
}
