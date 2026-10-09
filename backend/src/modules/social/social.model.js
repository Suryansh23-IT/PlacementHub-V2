import mongoose from 'mongoose'

const postSchema = new mongoose.Schema({ authorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true }, authorRole: { type: String, enum: ['placement_admin', 'company'], required: true }, contentType: { type: String, enum: ['feed', 'article'], default: 'feed', required: true }, title: { type: String, trim: true, maxlength: 180 }, content: { type: String, required: true, trim: true, maxlength: 20000 }, image: { filename: String, mimeType: String, size: Number }, editedAt: Date, deletedAt: Date }, { timestamps: true })
postSchema.pre('validate', function () {
  if (this.contentType === 'article' && !this.title?.trim()) this.invalidate('title', 'Article title is required.')
  if (this.contentType === 'article' && this.image?.filename) this.invalidate('image', 'Articles are text only.')
  if (this.contentType === 'feed' && !this.image?.filename) this.invalidate('image', 'Feed requires one image.')
  if (this.contentType === 'feed' && this.content?.length > 3000) this.invalidate('content', 'Feed content must be at most 3000 characters.')
})
postSchema.index({ contentType: 1, createdAt: -1, _id: -1 })
postSchema.index({ createdAt: -1, _id: -1 })
const likeSchema = new mongoose.Schema({ postId: { type: mongoose.Schema.Types.ObjectId, ref: 'SocialPost', required: true }, userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, }, { timestamps: true })
likeSchema.index({ postId: 1, userId: 1 }, { unique: true })
const commentSchema = new mongoose.Schema({ postId: { type: mongoose.Schema.Types.ObjectId, ref: 'SocialPost', required: true, index: true }, authorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, authorRole: { type: String, enum: ['student', 'company', 'placement_admin'], required: true }, content: { type: String, required: true, trim: true, maxlength: 1200 } }, { timestamps: true })
commentSchema.index({ postId: 1, createdAt: 1, _id: 1 })
export const SocialPost = mongoose.models.SocialPost ?? mongoose.model('SocialPost', postSchema)
export const SocialLike = mongoose.models.SocialLike ?? mongoose.model('SocialLike', likeSchema)
export const SocialComment = mongoose.models.SocialComment ?? mongoose.model('SocialComment', commentSchema)
