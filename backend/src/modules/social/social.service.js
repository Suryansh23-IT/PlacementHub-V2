import { notificationScope } from '../notifications/notification-domain.js'
import { SocialProfile } from './social-profile.model.js'
import { AppError } from '../../errors/app-error.js'
import { User } from '../auth/auth.model.js'
import { StudentProfile } from '../students/student.model.js'
import { Company } from '../companies/company.model.js'
import { Notification } from '../notifications/notification.model.js'
import { SocialComment, SocialLike, SocialPost } from './social.model.js'
import { postBodySchema } from './social.validation.js'
import { storeImage, removeImage, imagePath } from './social.media.js'

const missing = () => new AppError('Community post was not found.', { statusCode: 404, errorCode: 'NOT_FOUND' })
const forbidden = () => new AppError('You are not authorized to modify this community content.', { statusCode: 403, errorCode: 'FORBIDDEN' })
const publisherRoles = ['placement_admin', 'company']
const active = id => ({ _id: id, authorRole: { $in: publisherRoles }, deletedAt: { $exists: false } })
const requirePublisher = user => { if (!publisherRoles.includes(user.role)) throw forbidden() }
const canEdit = (user, post) => user.role === 'placement_admin' ? post.authorRole === 'placement_admin' : user.role === 'company' && post.authorRole === 'company' && String(post.authorUserId) === String(user._id)
export async function authorizePostMutation(user, id, action, deps = {}) {
  requirePublisher(user)
  const post = await (deps.postModel ?? SocialPost).findOne(active(id))
  if (!post) throw missing()
  if (!(action === 'delete' && user.role === 'placement_admin') && !canEdit(user, post)) throw forbidden()
  return post
}
async function authors(ids, { userModel = User, profileModel = StudentProfile, companyModel = Company, socialProfileModel = SocialProfile } = {}) { const users = await userModel.find({ _id: { $in: ids } }).select('name role').lean(); const userMap = new Map(users.map(x => [String(x._id), x])); const [profiles, companies, socialProfiles] = await Promise.all([profileModel.find({ userId: { $in: ids } }).select('userId branch').lean(), companyModel.find({ userId: { $in: ids } }).select('userId companyName').lean(), socialProfileModel.find({ userId: { $in: ids } }).select('userId companyName avatar updatedAt').lean()]); const socialMap = new Map(socialProfiles.map(x => [String(x.userId), x])); const profileMap = new Map(profiles.map(x => [String(x.userId), x])); const companyMap = new Map(companies.map(x => [String(x.userId), x])); return id => { const social = socialMap.get(String(id)); const avatar = { hasAvatar: Boolean(social?.avatar?.filename), avatarVersion: social?.avatar?.filename ? social.updatedAt : undefined }; const user = userMap.get(String(id)); if (user?.role === 'placement_admin') return { userId: String(id), name: 'Placement Administration', role: user.role, label: 'Official' }; if (user?.role === 'company') return { userId: String(id), ...avatar, name: social?.companyName || companyMap.get(String(id))?.companyName || user.name, role: user.role, label: 'Company' }; return { userId: String(id), ...avatar, name: user?.name || 'Student', role: 'student', label: 'Student', detail: profileMap.get(String(id))?.branch || null } } }
async function presentPost(post, viewerId, deps = {}) {
  const [getAuthor, likes, comments, liked] = await Promise.all([authors([post.authorUserId], deps), (deps.likeModel ?? SocialLike).countDocuments({ postId: post._id }), (deps.commentModel ?? SocialComment).countDocuments({ postId: post._id }), viewerId ? (deps.likeModel ?? SocialLike).exists({ postId: post._id, userId: viewerId }) : false])
  const contentType = post.contentType || 'feed'
  return { _id: post._id, contentType, title: contentType === 'article' ? post.title : undefined, content: post.content, image: contentType === 'feed' && post.image?.filename ? { mimeType: post.image.mimeType, size: post.image.size } : null, createdAt: post.createdAt, updatedAt: post.updatedAt, edited: Boolean(post.editedAt) || new Date(post.updatedAt).getTime() !== new Date(post.createdAt).getTime(), author: getAuthor(post.authorUserId), likeCount: likes, commentCount: comments, likedByMe: Boolean(liked), canEdit: canEdit({ _id: viewerId, role: deps.viewerRole }, post), canDelete: deps.viewerRole === 'placement_admin' || canEdit({ _id: viewerId, role: deps.viewerRole }, post), canModerate: deps.viewerRole === 'placement_admin' }
}
export async function listPosts(user, { page = 1, limit = 10, contentType = 'feed', search = '', sort = 'newest' } = {}, deps = {}) {
  const model = deps.postModel ?? SocialPost
  const query = { authorRole: { $in: publisherRoles }, deletedAt: { $exists: false }, ...(contentType === 'article' ? { contentType: 'article' } : { $or: [{ contentType: 'feed' }, { contentType: { $exists: false } }] }) }
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = { $regex: escaped, $options: 'i' }
    query.$and = [{ $or: contentType === 'article' ? [{ title: match }, { content: match }] : [{ content: match }] }]
  }
  const direction = sort === 'oldest' ? 1 : -1
  const [posts, total] = await Promise.all([model.find(query).sort({ createdAt: direction, _id: direction }).skip((page - 1) * limit).limit(limit), model.countDocuments(query)])
  const data = await Promise.all(posts.map(post => presentPost(post, user._id, { ...deps, viewerRole: user.role })))
  return { records: data, page, limit, totalRecords: total, totalPages: Math.max(1, Math.ceil(total / limit)) }
}
export async function createPost(user, rawInput, deps = {}) {
  requirePublisher(user)
  const input = postBodySchema.parse(rawInput)
  if (input.contentType === 'feed' && !deps.imageFile) throw new AppError('Feed requires exactly one image.', { statusCode: 422, errorCode: 'VALIDATION_ERROR' })
  const audience = input.audience || 'students'
  if (input.notifyCommunity && user.role === 'company' && audience !== 'students') throw forbidden()
  if (input.removeImage) throw new AppError('Image removal is unavailable for Feed.', { statusCode: 422, errorCode: 'VALIDATION_ERROR' })
  if (input.contentType === 'article' && deps.imageFile) throw new AppError('Articles are text only.', { statusCode: 422, errorCode: 'VALIDATION_ERROR' })
  const image = await (deps.storeImage ?? storeImage)(deps.imageFile)
  let post
  try { post = await (deps.postModel ?? SocialPost).create({ authorUserId: user._id, authorRole: user.role, contentType: input.contentType, title: input.title, content: input.content, ...(image ? { image } : {}) }) }
  catch (error) { if (image) await (deps.removeImage ?? removeImage)(image); throw error }
  if (input.notifyCommunity) {
    try {
    const roles = audience === 'students' ? ['student'] : audience === 'companies' ? ['company'] : ['student', 'company', 'placement_admin']
    const recipients = await (deps.userModel ?? User).find({ role: { $in: roles }, isActive: true }).select('_id').lean()
    const deliveries = [...new Set(recipients.map(x => String(x._id)))].filter(id => id !== String(user._id)).map(recipientId => ({ recipientId, senderId: user._id, domain: 'community', category: 'community', type: 'community_broadcast', source: user.role === 'company' ? 'company' : 'college', title: input.contentType === 'article' ? 'New Community article' : 'New Community Feed update', message: input.title || input.content.slice(0, 250), postId: post._id, context: { action: 'view_community_post' } }))
    if (deliveries.length) await (deps.notificationModel ?? Notification).create(deliveries)
    }
    catch (error) { await (deps.notificationModel ?? Notification).deleteMany({ postId: post._id, ...notificationScope('community') }); await (deps.postModel ?? SocialPost).deleteOne({ _id: post._id }); if (image) await (deps.removeImage ?? removeImage)(image); throw error }
  }
  return presentPost(post, user._id, { ...deps, viewerRole: user.role })
}
export async function getPost(user, id, deps = {}) {
  const post = await (deps.postModel ?? SocialPost).findOne(active(id))
  if (!post) throw missing()
  return presentPost(post, user._id, { ...deps, viewerRole: user.role })
}
export async function getPostImage(id, deps = {}) {
  const post = await (deps.postModel ?? SocialPost).findOne(active(id))
  if (!post || post.contentType === 'article' || !post.image?.filename) throw missing()
  return { path: imagePath(post.image), mimeType: post.image.mimeType }
}
export async function updatePost(user, id, rawInput, deps = {}) {
  const post = await authorizePostMutation(user, id, 'edit', deps)
  const input = postBodySchema.parse(rawInput)
  if (input.contentType !== (post.contentType || 'feed')) throw new AppError('Content type cannot be changed. Create a separate item instead.', { statusCode: 422, errorCode: 'VALIDATION_ERROR' })
  if (input.contentType === 'article' && deps.imageFile) throw new AppError('Articles are text only.', { statusCode: 422, errorCode: 'VALIDATION_ERROR' })
  if (input.notifyCommunity) throw new AppError('Community broadcast is available only when creating content.', { statusCode: 422, errorCode: 'VALIDATION_ERROR' })
  if (input.contentType === 'feed' && !deps.imageFile && (input.removeImage || !post.image?.filename)) throw new AppError('Feed must keep or replace its image.', { statusCode: 422, errorCode: 'VALIDATION_ERROR' })
  const previousImage = post.image?.filename ? { filename: post.image.filename, mimeType: post.image.mimeType, size: post.image.size } : undefined
  const replacement = await (deps.storeImage ?? storeImage)(deps.imageFile)
  post.content = input.content
  post.title = input.title
  post.editedAt = new Date()
  if (replacement || input.removeImage) post.image = replacement
  try { await post.save() } catch (error) { if (replacement) await (deps.removeImage ?? removeImage)(replacement); throw error }
  if (previousImage && (replacement || input.removeImage)) await (deps.removeImage ?? removeImage)(previousImage)
  return presentPost(post, user._id, { ...deps, viewerRole: user.role })
}
export async function deletePost(user, id, deps = {}) {
  const model = deps.postModel ?? SocialPost
  const post = await authorizePostMutation(user, id, 'delete', deps)
  // Remove children first; failures retain the parent for a safe retry.
  await (deps.likeModel ?? SocialLike).deleteMany({ postId: post._id })
  await (deps.commentModel ?? SocialComment).deleteMany({ postId: post._id })
  await (deps.notificationModel ?? Notification).deleteMany({ postId: post._id, ...notificationScope('community') })
  await (deps.removeImage ?? removeImage)(post.image)
  await model.deleteOne({ _id: post._id })
  return { deleted: true }
}
export async function toggleLike(user, id, like, deps = {}) { const post = await (deps.postModel ?? SocialPost).findOne(active(id)); if (!post) throw missing(); const model = deps.likeModel ?? SocialLike; if (like) { try { await model.create({ postId: post._id, userId: user._id }) } catch (error) { if (error.code !== 11000) throw error } } else await model.deleteOne({ postId: post._id, userId: user._id }); return presentPost(post, user._id, { ...deps, viewerRole: user.role }) }
export async function listComments(user, id, deps = {}) { const post = await (deps.postModel ?? SocialPost).findOne(active(id)); if (!post) throw missing(); const rows = await (deps.commentModel ?? SocialComment).find({ postId: post._id }).sort({ createdAt: 1, _id: 1 }); const getAuthor = await authors(rows.map(x => x.authorUserId), deps); return rows.map(row => ({ _id: row._id, content: row.content, createdAt: row.createdAt, updatedAt: row.updatedAt, author: getAuthor(row.authorUserId), canDelete: String(row.authorUserId) === String(user._id) || user.role === 'placement_admin' })) }
export async function createComment(user, id, input, deps = {}) { const post = await (deps.postModel ?? SocialPost).findOne(active(id)); if (!post) throw missing(); const comment = await (deps.commentModel ?? SocialComment).create({ postId: post._id, authorUserId: user._id, authorRole: user.role, content: input.content }); if (String(post.authorUserId) !== String(user._id)) await (deps.notificationModel ?? Notification).create({ recipientId: post.authorUserId, senderId: user._id, domain: 'community', category: 'community_comment', type: 'community_comment', source: 'college', title: 'New comment on your community post', message: `${user.name} commented on your post.`, postId: post._id, context: { action: 'view_community_post', audience: post.authorRole } }); return { _id: comment._id, content: comment.content, createdAt: comment.createdAt, updatedAt: comment.updatedAt, author: (await authors([user._id], deps))(user._id), canDelete: true } }
export async function deleteComment(user, id, deps = {}) { const model = deps.commentModel ?? SocialComment; const comment = await model.findById(id); if (!comment) throw new AppError('Community comment was not found.', { statusCode: 404, errorCode: 'NOT_FOUND' }); if (String(comment.authorUserId) !== String(user._id) && user.role !== 'placement_admin') throw forbidden(); await model.deleteOne({ _id: id }); return { deleted: true } }
