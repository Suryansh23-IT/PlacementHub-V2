import { AppError } from '../../errors/app-error.js'
import { Application } from '../applications/application.model.js'
import { PlacementDrive } from '../placement-drives/placement-drive.model.js'
import { PlacementRecord } from './placement-record.model.js'
import { createNotifications } from '../notifications/notification.service.js'
import { readFile } from 'node:fs/promises'
const fail = (message, code = 'CONFLICT') => new AppError(message, { statusCode: code === 'NOT_FOUND' ? 404 : 409, errorCode: code })
const blocking = type => ['full_time', 'ppo', 'internship_and_ppo'].includes(type)
const assign = (doc, values) => typeof doc.set === 'function' ? doc.set(values) : Object.assign(doc, values)
export async function submitPlacementReport(studentId, applicationId, input, { applicationModel = Application, driveModel = PlacementDrive, recordModel = PlacementRecord, now = new Date() } = {}) {
  const application = await applicationModel.findOne({ _id: applicationId, studentId }); if (!application) throw fail('Application was not found.', 'NOT_FOUND')
  if (application.currentStatus !== 'selected_pending_confirmation') throw fail('Only a provisionally selected application can be reported.')
  const drive = await driveModel.findOne({ _id: application.placementDriveId }); if (!drive) throw fail('Placement Drive was not found.', 'NOT_FOUND')
  let record = await recordModel.findOne({ applicationId })
  const values = { ...input, studentId, applicationId, placementDriveId: drive._id, companyId: drive.companyId, role: drive.role?.title, companySelectedAt: application.phaseHistory?.at(-1)?.occurredAt ?? now, studentReportedAt: now, verificationState: 'pending_admin_verification' }
  if (record) { if (record.verificationState === 'confirmed') throw fail('This placement outcome is already confirmed.'); if (record.verificationState === 'revoked') throw fail('A revoked outcome cannot be resubmitted.'); assign(record, { ...values, history: [...(record.history ?? []), { event: 'student_report_updated', occurredAt: now, actorId: studentId }] }); await record.save() } else { record = await recordModel.create({ ...values, history: [{ event: 'student_reported', occurredAt: now, actorId: studentId }] }) }
  return record
}
export async function savePlacementProof(studentId, applicationId, file, { recordModel = PlacementRecord, now = new Date() } = {}) {
  if (!file) throw fail('Attach a PDF proof document.', 'VALIDATION_ERROR')
  const bytes = await readFile(file.path).catch(() => null)
  if (!bytes?.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw fail('The uploaded proof is not a valid PDF.', 'VALIDATION_ERROR')
  const record = await recordModel.findOne({ applicationId, studentId, verificationState: { $in: ['pending_admin_verification', 'rejected'] } })
  if (!record) throw fail('A pending placement report was not found.', 'NOT_FOUND')
  assign(record, { proof: [...(record.proof ?? []), { originalName: file.originalname, storagePath: file.path, mimeType: file.mimetype, size: file.size, uploadedAt: now }], history: [...(record.history ?? []), { event: 'proof_uploaded', occurredAt: now, actorId: studentId }] })
  return record.save()
}
export async function getPlacementProof(actorId, recordId, proofIndex, { recordModel = PlacementRecord, isAdmin = false } = {}) {
  const record = await recordModel.findOne(isAdmin ? { _id: recordId } : { _id: recordId, studentId: actorId })
  const proof = record?.proof?.[Number(proofIndex)]
  if (!proof) throw fail('Placement proof was not found.', 'NOT_FOUND')
  return proof
}
export async function confirmPlacementRecord(adminId, recordId, input, { recordModel = PlacementRecord, applicationModel = Application, notificationService = createNotifications, now = new Date() } = {}) {
  const record = await recordModel.findOne({ _id: recordId }); if (!record) throw fail('Placement outcome was not found.', 'NOT_FOUND')
  const application = await applicationModel.findOne({ _id: record.applicationId, studentId: record.studentId }); if (!application) throw fail('The source application was not found.')
  const alreadyConfirmed = record.verificationState === 'confirmed'
  if (!alreadyConfirmed && record.verificationState !== 'pending_admin_verification') throw fail('Only a pending placement report can be confirmed.')
  if (!alreadyConfirmed && application.currentStatus !== 'selected_pending_confirmation') throw fail('The Company selection is no longer valid.')
  // A standalone MongoDB cannot use multi-document transactions. A failed
  // request is therefore resumable: the confirmed record is the durable
  // operation key and every following write is conditional on its old state.
  if (!alreadyConfirmed) { assign(record, { ...(input.corrections ?? {}), verificationState: 'confirmed', adminVerifiedAt: now, history: [...(record.history ?? []), { event: 'admin_confirmed', occurredAt: now, actorId: adminId, note: input.reason }] }); await record.save() }
  let repaired = false
  if (application.currentStatus === 'selected_pending_confirmation') { const history = application.phaseHistory ?? []; const alreadyRecorded = history.some(entry => entry.event === 'placement_confirmed'); assign(application, { currentStatus: 'placement_confirmed', phaseHistory: alreadyRecorded ? history : [...history, { phase: application.currentPhase, status: 'placement_confirmed', event: 'placement_confirmed', occurredAt: now, actorId: adminId }] }); await application.save(); repaired = true }
  if (application.currentStatus !== 'placement_confirmed') throw fail('The source application cannot be finalized.')
  let closed = []; if (blocking(record.outcomeType)) { const others = await applicationModel.find({ studentId: record.studentId, _id: { $ne: application._id }, currentStatus: { $in: ['applied', 'screening', 'pending', 'result_pending', 'qualified', 'active', 'selected_pending_confirmation'] } }); for (const other of others) { assign(other, { currentStatus: 'closed_placed_elsewhere', phaseHistory: [...(other.phaseHistory ?? []), { phase: other.currentPhase, status: 'closed_placed_elsewhere', event: 'closed_placed_elsewhere', occurredAt: now, actorId: adminId }] }); await other.save(); closed.push(other); await notificationService([{ recipientId: record.studentId, senderId: adminId, category: 'placement_outcome', type: 'application_closed_placed_elsewhere', source: 'placement_system', title: 'Recruitment journey closed', message: 'This recruitment journey was closed because another placement was confirmed.', placementDriveId: other.placementDriveId, applicationId: other._id, companyId: record.companyId, context: { action: 'view_application', audience: 'student' } }]) } }
  if (!alreadyConfirmed) await notificationService([{ recipientId: record.studentId, senderId: adminId, category: 'placement_outcome', type: 'placement_confirmed', source: 'placement_system', title: 'Placement confirmed', message: 'The Placement Cell confirmed your placement outcome.', placementDriveId: record.placementDriveId, applicationId: record.applicationId, companyId: record.companyId, context: { action: 'view_application', audience: 'student' } }])
  return { record, alreadyConfirmed, repaired, closedApplications: closed.length }
}
export async function decidePlacementRecord(adminId, recordId, action, reason, { recordModel = PlacementRecord, now = new Date() } = {}) { const record = await recordModel.findOne({ _id: recordId }); if (!record) throw fail('Placement outcome was not found.', 'NOT_FOUND'); if (action === 'reject' && record.verificationState === 'pending_admin_verification') assign(record, { verificationState: 'rejected', history: [...(record.history ?? []), { event: 'admin_rejected', occurredAt: now, actorId: adminId, note: reason }] }); else if (action === 'revoke' && record.verificationState === 'confirmed') assign(record, { verificationState: 'revoked', history: [...(record.history ?? []), { event: 'admin_revoked', occurredAt: now, actorId: adminId, note: reason }] }); else throw fail('This placement outcome cannot receive that decision.'); return record.save() }
export async function notifyProvisionalSelection(application, action, companyUserId, { notificationService = createNotifications } = {}) {
  const selected = action === 'provisionally_select'
  await notificationService([{ recipientId: application.studentId, senderId: companyUserId, category: 'placement_outcome', type: selected ? 'company_selected' : 'company_unselected', source: 'company', title: selected ? 'Selected by Company' : 'Provisional selection reversed', message: selected ? 'The Company marked you selected. Submit your placement report for Placement Cell verification.' : 'The Company reversed its provisional selection.', placementDriveId: application.placementDriveId, applicationId: application._id, phaseNumber: application.currentPhase, context: { action: 'view_application', audience: 'student' } }])
}
export async function invalidateUnselectedPlacementReport(applicationId, companyUserId, { recordModel = PlacementRecord, now = new Date() } = {}) {
  const record = await recordModel.findOne({ applicationId, verificationState: { $in: ['company_provisional', 'pending_admin_verification', 'rejected'] } })
  if (!record) return null
  assign(record, { verificationState: 'rejected', history: [...(record.history ?? []), { event: 'company_selection_reversed', occurredAt: now, actorId: companyUserId }] })
  return record.save()
}
export async function listPlacementRecords(state, { recordModel = PlacementRecord } = {}) { return recordModel.find(state ? { verificationState: state } : {}).sort({ updatedAt: -1 }).populate('studentId', 'name email').populate('placementDriveId', 'role company') }
