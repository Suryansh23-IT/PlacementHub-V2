import { listCommunityNotifications, markCommunityRead, markCommunityAllRead } from './social-notification.controller.js'
import { notificationListQuerySchema, notificationIdParamsSchema } from '../notifications/notification.validation.js'
import { profileImageUpload } from './social-profile.media.js'
import { socialProfileBodySchema } from './social-profile.validation.js'
import { Router } from 'express'
import { authenticate, authorizeRoles } from '../auth/auth.middleware.js'
import { validateBody, validateParams, validateQuery } from '../../middleware/validate-request.js'
import * as c from './social.controller.js'
import { socialProfile, studentMainProfile, authorizeEdit, updateProfile, profileAvatar } from './social-profile.controller.js'
import { profileParamsSchema } from './social.validation.js'
import { commentBodySchema, commentParamsSchema, postBodySchema, postParamsSchema, socialPageSchema } from './social.validation.js'
import { socialImageUpload } from './social.media.js'
import { env } from '../../config/env.js'
import { AppError } from '../../errors/app-error.js'
const socialDatabase = new URL(env.MONGO_URI).pathname.replace(/^\//, '') === 'placementhub-v2-demo-2027'
const publishersOnly = authorizeRoles('placement_admin', 'company')
export const socialRouter = Router()
socialRouter.use(authenticate)
socialRouter.use((request, response, next) => socialDatabase ? next() : next(new AppError('Community is available only in the current placement cycle.', { statusCode: 404, errorCode: 'NOT_FOUND' })))
socialRouter.get('/notifications', validateQuery(notificationListQuerySchema), listCommunityNotifications)
socialRouter.patch('/notifications/read-all', markCommunityAllRead)
socialRouter.patch('/notifications/:id/read', validateParams(notificationIdParamsSchema), markCommunityRead)
socialRouter.patch('/profiles/:userId', validateParams(profileParamsSchema), authorizeEdit, profileImageUpload, validateBody(socialProfileBodySchema), updateProfile)
socialRouter.get('/profiles/:userId/avatar', validateParams(profileParamsSchema), profileAvatar)
socialRouter.get('/profiles/:userId', validateParams(profileParamsSchema), socialProfile)
socialRouter.get('/profiles/:userId/main-profile', authorizeRoles('company', 'placement_admin'), validateParams(profileParamsSchema), studentMainProfile)
socialRouter.get('/posts', validateQuery(socialPageSchema), c.listPosts)
socialRouter.post('/posts', publishersOnly, socialImageUpload, validateBody(postBodySchema), c.createPost)
socialRouter.get('/posts/:postId', validateParams(postParamsSchema), c.getPost)
socialRouter.get('/posts/:postId/image', validateParams(postParamsSchema), c.getImage)
socialRouter.patch('/posts/:postId', publishersOnly, validateParams(postParamsSchema), c.authorizeEdit, socialImageUpload, validateBody(postBodySchema), c.updatePost)
socialRouter.delete('/posts/:postId', publishersOnly, validateParams(postParamsSchema), c.deletePost)
socialRouter.post('/posts/:postId/like', validateParams(postParamsSchema), c.like)
socialRouter.delete('/posts/:postId/like', validateParams(postParamsSchema), c.unlike)
socialRouter.get('/posts/:postId/comments', validateParams(postParamsSchema), c.listComments)
socialRouter.post('/posts/:postId/comments', validateParams(postParamsSchema), validateBody(commentBodySchema), c.createComment)
socialRouter.delete('/comments/:commentId', validateParams(commentParamsSchema), c.deleteComment)
