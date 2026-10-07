import mongoose from 'mongoose'

export const HISTORICAL_SEED_KEY = 'NITR-PLACEMENT-2025-26'

const historicalSeedManifestSchema = new mongoose.Schema({
  seedKey: { type: String, required: true, unique: true, immutable: true },
  status: { type: String, required: true, enum: ['planning', 'seeding', 'ready', 'resetting', 'reset'], default: 'planning' },
  canonicalInputHash: { type: String, trim: true, maxlength: 128 },
  studentUserIds: [{ type: mongoose.Schema.Types.ObjectId }],
  studentProfileIds: [{ type: mongoose.Schema.Types.ObjectId }],
  companyUserIds: [{ type: mongoose.Schema.Types.ObjectId }],
  companyProfileIds: [{ type: mongoose.Schema.Types.ObjectId }],
  studentPolicyAcceptanceIds: [{ type: mongoose.Schema.Types.ObjectId }],
  recruiterPolicyAcceptanceIds: [{ type: mongoose.Schema.Types.ObjectId }],
  proposalIds: [{ type: mongoose.Schema.Types.ObjectId }],
  placementDriveIds: [{ type: mongoose.Schema.Types.ObjectId }],
  applicationIds: [{ type: mongoose.Schema.Types.ObjectId }],
  placementRecordIds: [{ type: mongoose.Schema.Types.ObjectId }],
  notificationIds: [{ type: mongoose.Schema.Types.ObjectId }],
  placementRestrictionIds: [{ type: mongoose.Schema.Types.ObjectId }],
  incidentReportIds: [{ type: mongoose.Schema.Types.ObjectId }],
  ownedUploadDirectories: [{ type: String, trim: true, maxlength: 1000 }],
  ownedUploadPaths: [{ type: String, trim: true, maxlength: 1000 }],
}, { timestamps: true })

export const HistoricalSeedManifest = mongoose.models.HistoricalSeedManifest
  ?? mongoose.model('HistoricalSeedManifest', historicalSeedManifestSchema)
