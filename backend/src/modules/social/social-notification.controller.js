import { sendSuccess } from '../../utils/api-response.js'
import { listNotificationPage, markAllNotificationsRead, markStudentNotificationRead } from '../notifications/notification.service.js'
export const listCommunityNotifications = async (r,s) => sendSuccess(s, { data: await listNotificationPage(r.user._id, r.validatedQuery, { domain: 'community' }) })
export const markCommunityRead = async (r,s) => sendSuccess(s, { data: await markStudentNotificationRead(r.user._id, r.params.id, { domain: 'community' }) })
export const markCommunityAllRead = async (r,s) => sendSuccess(s, { data: await markAllNotificationsRead(r.user._id, { domain: 'community' }) })
