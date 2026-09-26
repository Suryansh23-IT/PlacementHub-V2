import mongoose from 'mongoose'

const incidentReportSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  applicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Application', required: true, index: true },
  placementDriveId: { type: mongoose.Schema.Types.ObjectId, ref: 'PlacementDrive', required: true, index: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  phase: { type: Number, required: true, min: 0, max: 5 },
  applicationStatus: { type: String, required: true, trim: true, maxlength: 80 },
  category: { type: String, required: true, enum: ['withdrawal', 'absent', 'cheating', 'misconduct', 'rule_violation', 'document_or_information_issue', 'other'], index: true },
  description: { type: String, required: true, trim: true, maxlength: 1500 },
  note: { type: String, trim: true, maxlength: 1500 },
  reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reviewStatus: { type: String, required: true, enum: ['pending_review', 'reviewed', 'closed'], default: 'pending_review', index: true },
  decision: { type: String, enum: ['no_action', 'warning_only', 'temporary_restriction', 'permanent_restriction', 'refer_to_department'] },
  reviewNote: { type: String, trim: true, maxlength: 1500 },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: { type: Date },
  restrictionId: { type: mongoose.Schema.Types.ObjectId, ref: 'PlacementRestriction' },
  archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  archivedAt: { type: Date },
}, { timestamps: true })

incidentReportSchema.index({ companyId: 1, placementDriveId: 1, reviewStatus: 1, createdAt: -1 })

export const IncidentReport = mongoose.models.IncidentReport ?? mongoose.model('IncidentReport', incidentReportSchema)
