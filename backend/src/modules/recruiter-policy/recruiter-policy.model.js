import mongoose from 'mongoose'
import { createAcceptanceSchema, createPolicySchema } from '../placement-policy/policy.model.js'

const policySchema = createPolicySchema()
policySchema.index({ academicYear: 1, version: 1 }, { unique: true })
export const RecruiterPlacementPolicy = mongoose.models.RecruiterPlacementPolicy ?? mongoose.model('RecruiterPlacementPolicy', policySchema)
export const RecruiterPolicyAcceptance = mongoose.models.RecruiterPolicyAcceptance ?? mongoose.model('RecruiterPolicyAcceptance', createAcceptanceSchema('companyId', 'RecruiterPlacementPolicy'))
