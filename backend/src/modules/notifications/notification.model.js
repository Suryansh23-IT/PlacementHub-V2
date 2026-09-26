import mongoose from 'mongoose'

const notificationSchema = new mongoose.Schema({
  recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  notificationBatchId: { type: String, trim: true, maxlength: 64, index: true },
  category: { type: String, required: true, trim: true, maxlength: 80, index: true },
  type: { type: String, required: true, trim: true, maxlength: 120 },
  source: { type: String, required: true, enum: ['placement_system', 'college', 'company', 'disciplinary_action'], default: 'placement_system', index: true },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  message: { type: String, required: true, trim: true, maxlength: 1500 },
  placementDriveId: { type: mongoose.Schema.Types.ObjectId, ref: 'PlacementDrive', index: true },
  applicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Application' },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', index: true },
  context: {
    action: { type: String, enum: ['view_drive', 'view_application', 'view_incident', 'view_restriction', 'view_company'], trim: true },
    audience: { type: String, enum: ['eligible_students', 'eligible_drive', 'drive_applicants', 'company', 'placement_admin'], trim: true },
  },
  isRead: { type: Boolean, required: true, default: false },
  readAt: Date,
}, { timestamps: true })

notificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 })
notificationSchema.index({ senderId: 1, createdAt: -1 })

export const Notification = mongoose.models.Notification ?? mongoose.model('Notification', notificationSchema)
