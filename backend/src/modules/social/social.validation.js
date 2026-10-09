import { z } from 'zod'
export const profileParamsSchema = z.object({ userId: z.string().regex(/^[a-f\d]{24}$/i, 'User ID must be valid.') })
const id = z.object({ postId: z.string().regex(/^[a-f\d]{24}$/i), commentId: z.string().regex(/^[a-f\d]{24}$/i) })
const removeImage = z.preprocess(value => value === 'true' ? true : value === 'false' ? false : value, z.boolean().optional())
const broadcast = { notifyCommunity: z.preprocess(v => v === 'true' ? true : v === 'false' ? false : v, z.boolean().optional()), audience: z.enum(['students', 'companies', 'everyone']).optional() }
const feed = z.object({ ...broadcast, contentType: z.literal('feed'), content: z.string().trim().min(1, 'Content is required.').max(3000), title: z.literal('').optional(), removeImage })
const article = z.object({ ...broadcast, contentType: z.literal('article'), title: z.string().trim().min(1, 'Article title is required.').max(180), content: z.string().trim().min(1, 'Article body is required.').max(20000), image: z.never().optional(), removeImage: z.literal(false).optional() })
export const postBodySchema = z.preprocess(value => value && typeof value === 'object' ? { contentType: 'feed', ...value } : value, z.discriminatedUnion('contentType', [feed, article]))
export const commentBodySchema = z.object({ content: z.string().trim().min(1, 'Comment is required.').max(1200) })
export const postParamsSchema = id.pick({ postId: true })
export const commentParamsSchema = id.pick({ commentId: true })
export const socialPageSchema = z.object({ contentType: z.enum(['feed', 'article']).default('feed'), search: z.string().trim().max(200).default(''), sort: z.enum(['newest', 'oldest']).default('newest'), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(25).default(10) })
