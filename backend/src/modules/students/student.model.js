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
const academicDocumentSchema = new mongoose.Schema({ board: { type: String, trim: true, maxlength: 120 }, schoolName: { type: String, trim: true, maxlength: 200 }, passingYear: { type: Number, min: 1990, max: 2100 }, score: { type: Number, min: 0, max: 100 }, marksheet: resumeSchema }, { _id: false })
const skillGroupSchema = new mongoose.Schema({ name: { type: String, trim: true, maxlength: 80 }, skills: [{ type: String, trim: true, maxlength: 60 }] }, { _id: true })
const semesterSpiSchema = new mongoose.Schema({ semester: { type: Number, min: 1, max: 8 }, spi: { type: Number, min: 0, max: 10 } }, { _id: false })
const codingProfileSchema = new mongoose.Schema({ platform: { type: String, trim: true, maxlength: 80 }, url: { type: String, trim: true, maxlength: 500 } }, { _id: true })

const studentProfileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    branch: { type: String, trim: true, maxlength: 100 },
    graduationYear: { type: Number, min: 2000, max: 2100 },
    cgpa: { type: Number, min: 0, max: 10 },
    activeBacklogs: { type: Number, min: 0, max: 100 },
    phone: { type: String, trim: true, maxlength: 30 },
    rollNumber: { type: String, trim: true, maxlength: 60 },
    class10: academicDocumentSchema,
    class12: academicDocumentSchema,
    semesterSpis: [semesterSpiSchema],
    skillGroups: [skillGroupSchema],
    skills: [{ type: String, trim: true, maxlength: 60 }],
    projects: [projectSchema],
    professionalLinks: {
      linkedin: { type: String, trim: true, maxlength: 500 },
      github: { type: String, trim: true, maxlength: 500 },
      portfolio: { type: String, trim: true, maxlength: 500 },
    },
    codingProfiles: [codingProfileSchema],
    resume: resumeSchema,
    collegeResult: resumeSchema,
    verificationStatus: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending', required: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    rejectionReason: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true },
)

studentProfileSchema.index({ verificationStatus: 1 })

export const StudentProfile = mongoose.models.StudentProfile ?? mongoose.model('StudentProfile', studentProfileSchema)
