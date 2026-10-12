import { sendSuccess } from '../../utils/api-response.js'
import { getSocialProfile, getStudentMainProfile, updateSocialProfile, authorizeProfileEdit, getProfileAvatar } from './social-profile.service.js'
export const socialProfile = async (request, response) => sendSuccess(response, { data: await getSocialProfile(request.user, request.params.userId) })
export const studentMainProfile = async (request, response) => sendSuccess(response, { data: await getStudentMainProfile(request.user, request.params.userId) })

export const authorizeEdit = async (r,s,next) => { await authorizeProfileEdit(r.user, r.params.userId); next() }
export const updateProfile = async (r,s) => sendSuccess(s, { data: await updateSocialProfile(r.user, r.params.userId, r.body, { imageFile: r.file }) })
export const profileAvatar = async (r,s) => {
  const image = await getProfileAvatar(r.params.userId)
  s.set({ 'Content-Type': image.mimeType, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' })
  return s.send(image.buffer)
}
