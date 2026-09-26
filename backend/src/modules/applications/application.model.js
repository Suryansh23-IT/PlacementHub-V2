import mongoose from 'mongoose'
import { APPLICATION_STATUSES } from './application.constants.js'

const phaseHistorySchema = new mongoose.Schema({
  phase: { type: Number, required: true, min: 0 },
  status: { type: String, required: true, enum: APPLICATION_STATUSES },
  event: { type: String, required: true, trim: true, maxlength: 80 },
  occurredAt: { type: Date, required: true },
  note: { type: String, trim: true, maxlength: 1500 },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { _id: false })

const applicationSchema = new mongoose.Schema({
  // Student User IDs are also used by StudentPolicyAcceptance.
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  placementDriveId: { type: mongoose.Schema.Types.ObjectId, ref: 'PlacementDrive', required: true, index: true },
  appliedAt: { type: Date, required: true, default: Date.now },
  // Phase 0 is system-owned applicant/screening flow; Company phases begin at 1.
  currentPhase: { type: Number, required: true, min: 0, default: 0 },
  currentStatus: { type: String, required: true, enum: APPLICATION_STATUSES, default: 'applied' },
  withdrawnAt: { type: Date },
  phaseHistory: {
    type: [phaseHistorySchema],
    required: true,
    default: () => [{ phase: 0, status: 'applied', event: 'applied', occurredAt: new Date() }],
    validate: {
      validator: history => Array.isArray(history) && history.length >= 1 && history[0].phase === 0 && history[0].event === 'applied',
      message: 'Application history must begin with the system-owned Phase 0 applied entry.',
    },
  },
}, { timestamps: true })

applicationSchema.index({ studentId: 1, placementDriveId: 1 }, { unique: true })
applicationSchema.index({ placementDriveId: 1, currentPhase: 1, currentStatus: 1 })

export const Application = mongoose.models.Application ?? mongoose.model('Application', applicationSchema)
