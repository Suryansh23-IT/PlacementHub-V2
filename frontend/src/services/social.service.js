import { apiRequest, API_URL } from './api-client.js'
const headers = token => ({ Authorization: `Bearer ${token}` })
export const listCommunityPosts = (token, page = 1, filters = {}) => apiRequest(`/social/posts?${new URLSearchParams({ page, limit: 10, contentType: 'feed', search: '', sort: 'newest', ...filters })}`, { headers: headers(token) })
export async function getCommunityImage(token, id) {
  const response = await fetch(`${API_URL}/social/posts/${id}/image`, { headers: headers(token) })
  if (!response.ok) throw new Error('Community image could not be loaded.')
  return response.blob()
}
export function communityPostBody(input, image, removeImage = false) {
  if (!image && !removeImage) return input
  const body = new FormData()
  for (const [key, value] of Object.entries(input)) body.append(key, value)
  if (image) body.append('image', image)
  if (removeImage) body.append('removeImage', 'true')
  return body
}
export const createCommunityPost = (token, body) => apiRequest('/social/posts', { method: 'POST', headers: headers(token), body })
export const getCommunityPost = (token, id) => apiRequest(`/social/posts/${id}`, { headers: headers(token) })
export const updateCommunityPost = (token, id, body) => apiRequest(`/social/posts/${id}`, { method: 'PATCH', headers: headers(token), body })
export const deleteCommunityPost = (token, id) => apiRequest(`/social/posts/${id}`, { method: 'DELETE', headers: headers(token) })
export const likeCommunityPost = (token, id, liked) => apiRequest(`/social/posts/${id}/like`, { method: liked ? 'DELETE' : 'POST', headers: headers(token) })
export const listCommunityComments = (token, id) => apiRequest(`/social/posts/${id}/comments`, { headers: headers(token) })
export const createCommunityComment = (token, id, body) => apiRequest(`/social/posts/${id}/comments`, { method: 'POST', headers: headers(token), body })
export const deleteCommunityComment = (token, id) => apiRequest(`/social/comments/${id}`, { method: 'DELETE', headers: headers(token) })
