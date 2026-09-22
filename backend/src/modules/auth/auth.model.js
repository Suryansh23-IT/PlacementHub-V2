import mongoose from 'mongoose'
import { USER_ROLES } from './auth.constants.js'

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: Object.values(USER_ROLES), default: USER_ROLES.STUDENT, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
)

userSchema.index(
  { role: 1 },
  { unique: true, partialFilterExpression: { role: USER_ROLES.PLACEMENT_ADMIN } },
)

export const User = mongoose.models.User ?? mongoose.model('User', userSchema)
