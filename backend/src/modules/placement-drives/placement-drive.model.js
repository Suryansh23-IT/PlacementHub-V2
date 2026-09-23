import mongoose from 'mongoose'
import { COMPANY_PHASE_TYPES, PLACEMENT_DRIVE_LIFECYCLE_STATUSES, PLACEMENT_DRIVE_PROPOSAL_STATUSES } from './placement-drive.constants.js'

const pdfMetadataSchema = new mongoose.Schema({
  originalName: { type: String, trim: true, maxlength: 255 },
  storagePath: { type: String, trim: true, maxlength: 1000 },
  mimeType: { type: String, enum: ['application/pdf'] },
  size: { type: Number, min: 1 },
  uploadedAt: Date,
}, { _id: false })

const phaseSchema = new mongoose.Schema({
  phaseNumber: { type: Number, required: true, min: 1, max: 5 },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  type: { type: String, required: true, enum: COMPANY_PHASE_TYPES },
  description: { type: String, trim: true, maxlength: 1500 },
}, { _id: false })

const placementDriveSchema = new mongoose.Schema({
  // This references the approved Company profile; Company details stay in Company.
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  role: {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    domain: { type: String, trim: true, maxlength: 100 },
    employmentType: { type: String, required: true, enum: ['full_time', 'internship', 'internship_to_full_time'] },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    requiredSkills: [{ type: String, trim: true, maxlength: 80 }],
  },
  driveDetails: {
    workMode: { type: String, required: true, enum: ['online', 'offline', 'hybrid'] },
    workLocation: { type: String, required: true, trim: true, maxlength: 160 },
    expectedHires: { type: Number, required: true, min: 1 },
    compensation: {
      amount: { type: Number, min: 0 },
      currency: { type: String, trim: true, maxlength: 10, default: 'INR' },
      period: { type: String, enum: ['per_annum', 'per_month', 'stipend', 'not_disclosed'], default: 'not_disclosed' },
    },
    applicationDeadline: { type: Date, required: true },
    joiningPeriod: { type: String, trim: true, maxlength: 200 },
    serviceBond: { type: String, trim: true, maxlength: 1000 },
  },
  eligibility: {
    minimumCgpa: { type: Number, required: true, min: 0, max: 10 },
    allowedBranches: [{ type: String, required: true, trim: true, maxlength: 100 }],
    maximumActiveBacklogs: { type: Number, required: true, min: 0, max: 100 },
    graduationYears: [{ type: Number, required: true, min: 2000, max: 2100 }],
    additionalRequirements: { type: String, trim: true, maxlength: 1500 },
  },
  documents: {
    companyRecruitmentInformation: pdfMetadataSchema,
    placementDriveJobDescription: pdfMetadataSchema,
  },
  // Phase 0 is system-owned by M6 and is deliberately absent from this array.
  phases: {
    type: [phaseSchema],
    required: true,
    validate: {
      validator: (phases) => Array.isArray(phases) && phases.length >= 1 && phases.length <= 5 && phases.every((phase, index) => phase.phaseNumber === index + 1),
      message: 'Define one to five consecutive Company phases numbered from 1. Phase 0 is reserved for applicant screening.',
    },
  },
  proposalStatus: { type: String, required: true, enum: Object.values(PLACEMENT_DRIVE_PROPOSAL_STATUSES), default: PLACEMENT_DRIVE_PROPOSAL_STATUSES.DRAFT, index: true },
  lifecycleStatus: { type: String, required: true, enum: Object.values(PLACEMENT_DRIVE_LIFECYCLE_STATUSES), default: PLACEMENT_DRIVE_LIFECYCLE_STATUSES.UNPUBLISHED, index: true },
  review: {
    requestedChanges: { type: String, trim: true, maxlength: 1500 },
    rejectionReason: { type: String, trim: true, maxlength: 1500 },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
  },
}, { timestamps: true })

placementDriveSchema.index({ companyId: 1, proposalStatus: 1, lifecycleStatus: 1 })
placementDriveSchema.index({ 'driveDetails.applicationDeadline': 1 })

export const PlacementDrive = mongoose.models.PlacementDrive ?? mongoose.model('PlacementDrive', placementDriveSchema)
