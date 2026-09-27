import mongoose from 'mongoose'
import { PLACEMENT_OUTCOME_TYPES, PLACEMENT_VERIFICATION_STATES } from './placement-record.constants.js'

const proofMetadataSchema = new mongoose.Schema({
  originalName: { type: String, trim: true, maxlength: 255 },
  storagePath: { type: String, trim: true, maxlength: 1000 },
  mimeType: { type: String, trim: true, maxlength: 120 },
  size: { type: Number, min: 1 },
  uploadedAt: { type: Date },
}, { _id: false })

const placementHistorySchema = new mongoose.Schema({
  event: { type: String, required: true, trim: true, maxlength: 80 },
  occurredAt: { type: Date, required: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  note: { type: String, trim: true, maxlength: 1500 },
}, { _id: false })

const placementRecordSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  applicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Application', required: true, unique: true },
  placementDriveId: { type: mongoose.Schema.Types.ObjectId, ref: 'PlacementDrive', required: true, index: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  outcomeType: { type: String, required: true, enum: PLACEMENT_OUTCOME_TYPES },
  role: { type: String, required: true, trim: true, maxlength: 160 },
  package: {
    amount: { type: Number, min: 0 },
    currency: { type: String, trim: true, maxlength: 10, default: 'INR' },
    period: { type: String, enum: ['per_annum', 'per_month', 'not_disclosed'], default: 'not_disclosed' },
  },
  stipend: {
    amount: { type: Number, min: 0 },
    currency: { type: String, trim: true, maxlength: 10, default: 'INR' },
    period: { type: String, enum: ['per_month', 'not_disclosed'], default: 'not_disclosed' },
  },
  location: { type: String, trim: true, maxlength: 300 },
  joiningPeriod: { type: String, trim: true, maxlength: 200 },
  verificationState: { type: String, required: true, enum: PLACEMENT_VERIFICATION_STATES, default: 'company_provisional', index: true },
  companySelectedAt: { type: Date },
  studentReportedAt: { type: Date },
  adminVerifiedAt: { type: Date },
  proof: { type: [proofMetadataSchema], default: [] },
  notes: { type: String, trim: true, maxlength: 1500 },
  history: { type: [placementHistorySchema], default: [] },
}, { timestamps: true })

placementRecordSchema.index({ studentId: 1, verificationState: 1 })
placementRecordSchema.index({ placementDriveId: 1, companyId: 1 })

export const PlacementRecord = mongoose.models.PlacementRecord ?? mongoose.model('PlacementRecord', placementRecordSchema)
