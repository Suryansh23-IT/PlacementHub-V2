import mongoose from 'mongoose'

const companySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  companyName: { type: String, trim: true, maxlength: 160 },
  website: { type: String, trim: true, maxlength: 500 },
  industry: { type: String, trim: true, maxlength: 100 },
  location: { type: String, trim: true, maxlength: 160 },
  description: { type: String, trim: true, maxlength: 1500 },
  companyType: { type: String, trim: true, maxlength: 80 }, companySize: { type: String, trim: true, maxlength: 80 }, officialEmail: { type: String, trim: true, maxlength: 200 }, workLocations: [{ type: String, trim: true }], foundedYear: Number, linkedinUrl: String, careersUrl: String, technologies: [{ type: String, trim: true }], productsServices: { type: String, trim: true, maxlength: 1000 },
  recruiterName: { type: String, trim: true, maxlength: 120 },
  recruiterDesignation: { type: String, trim: true, maxlength: 120 },
  recruiterPhone: { type: String, trim: true, maxlength: 30 },
  recruiterEmail: { type: String, trim: true, maxlength: 200 }, alternateContact: { type: String, trim: true, maxlength: 100 },
  hiringType: { type: String, enum: ['placement', 'internship', 'both'] }, recruitmentTimeline: { type: String, trim: true, maxlength: 200 }, recruitmentMode: { type: String, enum: ['online', 'offline', 'hybrid'] }, expectedHires: { type: Number, min: 1 }, roleDomains: [{ type: String, trim: true }], targetBranches: [{ type: String, trim: true }], representativesCount: Number, preferredWorkLocations: [{ type: String, trim: true }], joiningPeriod: { type: String, trim: true, maxlength: 200 }, selectionProcess: { type: String, trim: true, maxlength: 1500 }, roundsCount: Number,
  participationLetter: { originalName: String, storagePath: String, mimeType: String, size: Number, uploadedAt: Date },
  approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', required: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, reviewedAt: Date,
  rejectionReason: { type: String, trim: true, maxlength: 500 },
}, { timestamps: true })
companySchema.index({ approvalStatus: 1 })
export const Company = mongoose.models.Company ?? mongoose.model('Company', companySchema)
