import { sendSuccess } from '../../utils/api-response.js'
import { listNotificationPage, listNotifications, listSentNotificationPage, listSentNotifications, listStudentNotifications, markAllNotificationsRead, markStudentNotificationRead, previewAdminExplorerNotification, previewCompanyCandidatesNotification, sendAdminCompanyNotification, sendAdminExplorerNotification, sendAdminStudentNotification, sendCompanyAdminNotification, sendCompanyCandidatesNotification, sendCompanyDriveApplicantsNotification, sendCompanyPhaseCandidatesNotification } from './notification.service.js'

export async function listMyNotifications(request, response) {
  return sendSuccess(response, { message: 'Notifications retrieved.', data: await listStudentNotifications(request.user._id) })
}

export async function markMyNotificationRead(request, response) {
  return sendSuccess(response, { message: 'Notification marked as read.', data: await markStudentNotificationRead(request.user._id, request.params.id) })
}
export async function listMyNotificationPage(request, response) { return sendSuccess(response, { message: 'Notifications retrieved.', data: await listNotificationPage(request.user._id, request.validatedQuery) }) }
export async function markMyNotificationsRead(request, response) { return sendSuccess(response, { message: 'Notifications marked as read.', data: await markAllNotificationsRead(request.user._id) }) }

export async function listAdminNotifications(request, response) { return sendSuccess(response, { message: 'Notifications retrieved.', data: await listNotifications(request.user._id) }) }
export async function listCompanyNotifications(request, response) { return sendSuccess(response, { message: 'Notifications retrieved.', data: await listNotifications(request.user._id) }) }
export async function listAdminSentNotifications(request, response) { return sendSuccess(response, { message: 'Sent notifications retrieved.', data: await listSentNotifications(request.user._id) }) }
export async function listCompanySentNotifications(request, response) { return sendSuccess(response, { message: 'Sent notifications retrieved.', data: await listSentNotifications(request.user._id) }) }
export async function listAdminSentNotificationPage(request, response) { return sendSuccess(response, { message: 'Sent notifications retrieved.', data: await listSentNotificationPage(request.user._id, request.validatedQuery) }) }
export async function listCompanySentNotificationPage(request, response) { return sendSuccess(response, { message: 'Sent notifications retrieved.', data: await listSentNotificationPage(request.user._id, request.validatedQuery) }) }
export async function markAdminNotificationRead(request, response) { return sendSuccess(response, { message: 'Notification marked as read.', data: await markStudentNotificationRead(request.user._id, request.params.id) }) }
export async function markCompanyNotificationRead(request, response) { return sendSuccess(response, { message: 'Notification marked as read.', data: await markStudentNotificationRead(request.user._id, request.params.id) }) }
export async function sendStudentsNotification(request, response) { return sendSuccess(response, { statusCode: 201, message: 'Student notification sent.', data: await sendAdminStudentNotification(request.user._id, request.body) }) }
export async function previewExplorerStudentsNotification(request, response) { return sendSuccess(response, { message: 'Recipients resolved.', data: await previewAdminExplorerNotification(request.body) }) }
export async function sendExplorerStudentsNotification(request, response) { return sendSuccess(response, { statusCode: 201, message: 'Student notification sent.', data: await sendAdminExplorerNotification(request.user._id, request.body) }) }
export async function sendCompanyNotification(request, response) { return sendSuccess(response, { statusCode: 201, message: 'Company notification sent.', data: await sendAdminCompanyNotification(request.user._id, request.params.companyUserId, request.body) }) }
export async function sendAdminNotification(request, response) { return sendSuccess(response, { statusCode: 201, message: 'Placement Admin notification sent.', data: await sendCompanyAdminNotification(request.user._id, request.body) }) }
export async function sendDriveApplicantsNotification(request, response) { return sendSuccess(response, { statusCode: 201, message: 'Applicant notification sent.', data: await sendCompanyDriveApplicantsNotification(request.user._id, request.body) }) }
export async function sendPhaseCandidatesNotification(request, response) { return sendSuccess(response, { statusCode: 201, message: 'Phase candidate notification sent.', data: await sendCompanyPhaseCandidatesNotification(request.user._id, request.body) }) }
export async function previewCompanyCandidates(request, response) { return sendSuccess(response, { message: 'Recipients resolved.', data: await previewCompanyCandidatesNotification(request.user._id, request.body) }) }
export async function sendCompanyCandidates(request, response) { return sendSuccess(response, { statusCode: 201, message: 'Candidate notification sent.', data: await sendCompanyCandidatesNotification(request.user._id, request.body) }) }
