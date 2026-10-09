import mongoose from 'mongoose'
const tags = { type: [String], default: undefined }
const socialProfileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  role: { type: String, enum: ['student', 'company', 'placement_admin'], required: true },
  headline: String, bio: String, hobbies: tags, interests: tags, softSkills: tags, personalityType: String,
  achievementHighlights: tags, clubs: tags, extracurriculars: tags, volunteering: tags, languages: tags,
  currentlyLearning: tags, lookingToExplore: tags,
  links: { linkedin: String, github: String, portfolio: String, codingProfile: String },
  companyName: String, industry: String, location: String, website: String, hiringDomains: tags,
  representativeName: String, designation: String, publicEmail: String, publicPhone: String, representativeNote: String,
  avatar: { filename: String, mimeType: String, size: Number },
}, { timestamps: true })
export const SocialProfile = mongoose.models.SocialProfile ?? mongoose.model('SocialProfile', socialProfileSchema)
