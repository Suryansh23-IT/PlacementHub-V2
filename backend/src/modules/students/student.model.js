import mongoose from 'mongoose'

const projectSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, required: true, trim: true, maxlength: 1000 },
    technologies: [{ type: String, trim: true, maxlength: 60 }],
    url: { type: String, trim: true, maxlength: 500 },
  },
  { _id: true },
)

const resumeSchema = new mongoose.Schema(
  {
    originalName: { type: String, required: true, trim: true, maxlength: 255 },
    storagePath: { type: String, required: true, trim: true },
    mimeType: { type: String, required: true, trim: true },
    size: { type: Number, required: true, min: 1 },
    uploadedAt: { type: Date, required: true },
  },
  { _id: false },
)

const studentProfileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    branch: { type: String, trim: true, maxlength: 100 },
    graduationYear: { type: Number, min: 2000, max: 2100 },
    cgpa: { type: Number, min: 0, max: 10 },
    activeBacklogs: { type: Number, min: 0, max: 100 },
    skills: [{ type: String, trim: true, maxlength: 60 }],
    projects: [projectSchema],
    resume: resumeSchema,
    verificationStatus: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending', required: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    rejectionReason: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true },
)

studentProfileSchema.index({ verificationStatus: 1 })

export const StudentProfile = mongoose.models.StudentProfile ?? mongoose.model('StudentProfile', studentProfileSchema)
