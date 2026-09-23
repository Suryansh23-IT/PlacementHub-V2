import mongoose from 'mongoose'
import { createAcceptanceSchema, createPolicySchema } from '../placement-policy/policy.model.js'

export const StudentPlacementPolicy = mongoose.models.StudentPlacementPolicy ?? mongoose.model('StudentPlacementPolicy', createPolicySchema())
export const StudentPolicyAcceptance = mongoose.models.StudentPolicyAcceptance ?? mongoose.model('StudentPolicyAcceptance', createAcceptanceSchema('studentId', 'StudentPlacementPolicy'))
