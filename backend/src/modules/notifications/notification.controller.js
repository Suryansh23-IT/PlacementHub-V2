import { sendSuccess } from '../../utils/api-response.js'
import { listNotifications, listSentNotifications, listStudentNotifications, markStudentNotificationRead, sendAdminCompanyNotification, sendAdminStudentNotification, sendCompanyAdminNotification, sendCompanyDriveApplicantsNotification } from './notification.service.js'

export async function listMyNotifications(request, response) {
  return sendSuccess(response, { message: 'Notifications retrieved.', data: await listStudentNotifications(request.user._id) })
}

export async function markMyNotificationRead(request, response) {
  return sendSuccess(response, { message: 'Notification marked as read.', data: await markStudentNotificationRead(request.user._id, request.params.id) })
}

export async function listAdminNotifications(request, response) { return sendSuccess(response, { message: 'Notifications retrieved.', data: await listNotifications(request.user._id) }) }
export async function listCompanyNotifications(request, response) { return sendSuccess(response, { message: 'Notifications retrieved.', data: await listNotifications(request.user._id) }) }
export async function listAdminSentNotifications(request, response) { return sendSuccess(response, { message: 'Sent notifications retrieved.', data: await listSentNotifications(request.user._id) }) }
export async function listCompanySentNotifications(request, response) { return sendSuccess(response, { message: 'Sent notifications retrieved.', data: await listSentNotifications(request.user._id) }) }
export async function markAdminNotificationRead(request, response) { return sendSuccess(response, { message: 'Notification marked as read.', data: await markStudentNotificationRead(request.user._id, request.params.id) }) }
export async function markCompanyNotificationRead(request, response) { return sendSuccess(response, { message: 'Notification marked as read.', data: await markStudentNotificationRead(request.user._id, request.params.id) }) }
export async function sendStudentsNotification(request, response) { return sendSuccess(response, { statusCode: 201, message: 'Student notification sent.', data: await sendAdminStudentNotification(request.user._id, request.body) }) }
export async function sendCompanyNotification(request, response) { return sendSuccess(response, { statusCode: 201, message: 'Company notification sent.', data: await sendAdminCompanyNotification(request.user._id, request.params.companyUserId, request.body) }) }
export async function sendAdminNotification(request, response) { return sendSuccess(response, { statusCode: 201, message: 'Placement Admin notification sent.', data: await sendCompanyAdminNotification(request.user._id, request.body) }) }
export async function sendDriveApplicantsNotification(request, response) { return sendSuccess(response, { statusCode: 201, message: 'Applicant notification sent.', data: await sendCompanyDriveApplicantsNotification(request.user._id, request.body) }) }
