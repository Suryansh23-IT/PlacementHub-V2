import mongoose from 'mongoose'

export const DEMO_2027_SEED_KEY = 'placementhub-v2-demo-2027-m9'

const demo2027SeedManifestSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, immutable: true },
  status: { type: String, required: true, enum: ['planned', 'seeding', 'ready', 'resetting', 'reset'], default: 'planned' },
  canonicalSourceHash: { type: String, trim: true, maxlength: 128 },
  adminUserIds: [{ type: mongoose.Schema.Types.ObjectId }],
  studentUserIds: [{ type: mongoose.Schema.Types.ObjectId }],
  studentProfileIds: [{ type: mongoose.Schema.Types.ObjectId }],
  companyUserIds: [{ type: mongoose.Schema.Types.ObjectId }],
  companyProfileIds: [{ type: mongoose.Schema.Types.ObjectId }],
  studentPolicyIds: [{ type: mongoose.Schema.Types.ObjectId }],
  recruiterPolicyIds: [{ type: mongoose.Schema.Types.ObjectId }],
  studentPolicyAcceptanceIds: [{ type: mongoose.Schema.Types.ObjectId }],
  recruiterPolicyAcceptanceIds: [{ type: mongoose.Schema.Types.ObjectId }],
  placementDriveIds: [{ type: mongoose.Schema.Types.ObjectId }],
  applicationIds: [{ type: mongoose.Schema.Types.ObjectId }],
  placementRecordIds: [{ type: mongoose.Schema.Types.ObjectId }],
  notificationIds: [{ type: mongoose.Schema.Types.ObjectId }],
  documentMetadata: { type: mongoose.Schema.Types.Mixed },
  ownedUploadDirectories: [{ type: String, trim: true, maxlength: 1000 }],
  ownedUploadPaths: [{ type: String, trim: true, maxlength: 1000 }],
}, { timestamps: true })

export const Demo2027SeedManifest = mongoose.models.Demo2027SeedManifest
  ?? mongoose.model('Demo2027SeedManifest', demo2027SeedManifestSchema)
