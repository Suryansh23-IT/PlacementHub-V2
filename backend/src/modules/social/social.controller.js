import { sendSuccess } from '../../utils/api-response.js'
import * as social from './social.service.js'
export const listPosts = async (r,s) => sendSuccess(s,{ data: await social.listPosts(r.user,r.validatedQuery) })
export const createPost = async (r,s) => sendSuccess(s,{ statusCode:201,data:await social.createPost(r.user,r.body,{ imageFile: r.file }) })
export const getPost = async (r,s) => sendSuccess(s,{ data:await social.getPost(r.user,r.params.postId) })
export const updatePost = async (r,s) => sendSuccess(s,{ data:await social.updatePost(r.user,r.params.postId,r.body,{ imageFile: r.file }) })
export const getImage = async (r,s,next) => {
  const image = await social.getPostImage(r.params.postId)
  s.set({ 'Content-Type': image.mimeType, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' })
  s.sendFile(image.path, error => { if (error && !s.headersSent) next(error.code === 'ENOENT' ? Object.assign(new Error('Community image was not found.'), { statusCode: 404, errorCode: 'NOT_FOUND' }) : error) })
}
export const deletePost = async (r,s) => sendSuccess(s,{ data:await social.deletePost(r.user,r.params.postId) })
export const like = async (r,s) => sendSuccess(s,{ data:await social.toggleLike(r.user,r.params.postId,true) })
export const unlike = async (r,s) => sendSuccess(s,{ data:await social.toggleLike(r.user,r.params.postId,false) })
export const listComments = async (r,s) => sendSuccess(s,{ data:await social.listComments(r.user,r.params.postId) })
export const createComment = async (r,s) => sendSuccess(s,{ statusCode:201,data:await social.createComment(r.user,r.params.postId,r.body) })
export const deleteComment = async (r,s) => sendSuccess(s,{ data:await social.deleteComment(r.user,r.params.commentId) })

export const authorizeEdit = async (r,s,next) => { await social.authorizePostMutation(r.user, r.params.postId, 'edit'); next() }
