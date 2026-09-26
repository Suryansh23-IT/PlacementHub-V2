import mongoose from 'mongoose'

const placementRestrictionSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  sourceIncidentReportId: { type: mongoose.Schema.Types.ObjectId, ref: 'IncidentReport' },
  placementDriveId: { type: mongoose.Schema.Types.ObjectId, ref: 'PlacementDrive' },
  applicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Application' },
  type: { type: String, required: true, enum: ['temporary_drive_count', 'permanent'] },
  status: { type: String, required: true, enum: ['active', 'inactive'], default: 'active', index: true },
  initialDriveCount: { type: Number, min: 1 },
  consumedDriveIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'PlacementDrive' }],
  remainingDriveCount: { type: Number, min: 0 },
  reason: { type: String, required: true, trim: true, maxlength: 500 },
  imposedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  imposedAt: { type: Date, required: true, default: Date.now },
  removedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  removedAt: { type: Date },
  removalReason: { type: String, trim: true, maxlength: 1000 },
  inactiveReason: { type: String, trim: true, maxlength: 200 },
}, { timestamps: true })

placementRestrictionSchema.index({ studentId: 1, status: 1 })

export const PlacementRestriction = mongoose.models.PlacementRestriction ?? mongoose.model('PlacementRestriction', placementRestrictionSchema)
