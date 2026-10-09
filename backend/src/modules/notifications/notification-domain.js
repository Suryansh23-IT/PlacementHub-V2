// Legacy Community deliveries have no domain. Recognize them without migrating
// archived or current records, so both inboxes stay isolated immediately.
const community = [{ domain: 'community' }, { type: { $in: ['community_comment', 'community_broadcast'] } }, { category: { $in: ['community', 'community_comment', 'community_broadcast'] } }]
export const notificationScope = (domain = 'placement') => domain === 'community' ? { $or: community } : { $nor: community }
