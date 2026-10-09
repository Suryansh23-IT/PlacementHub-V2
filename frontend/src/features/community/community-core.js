import { z } from 'zod'

export const postSchema = z.discriminatedUnion('contentType', [
  z.object({ contentType: z.literal('feed'), content: z.string().trim().min(1, 'Write an update before publishing.').max(3000, 'Use at most 3000 characters.') }),
  z.object({ contentType: z.literal('article'), title: z.string().trim().min(1, 'Article title is required.').max(180), content: z.string().trim().min(1, 'Article body is required.').max(20000) }),
])
export const commentSchema = z.object({ content: z.string().trim().min(1, 'Write a comment first.').max(1200, 'Use at most 1200 characters.') })
export const communityAvailable = cycle => cycle === '2027'
export const hasNextPage = feed => Boolean(feed && feed.page < feed.totalPages)
export function appendFeedPage(current, next, sort = 'newest') {
  const records = new Map(current.records.map(post => [String(post._id), post]))
  for (const post of next.records) records.set(String(post._id), post)
  const direction = sort === 'oldest' ? -1 : 1
  return { ...next, records: [...records.values()].sort((a, b) => direction * (new Date(b.createdAt) - new Date(a.createdAt) || String(b._id).localeCompare(String(a._id)))) }
}
