import mongoose from 'mongoose'

export function createPolicySchema() {
  const schema = new mongoose.Schema({
    title: { type: String, required: true, trim: true, maxlength: 200 },
    academicYear: { type: String, required: true, trim: true, maxlength: 30 },
    version: { type: String, required: true, trim: true, maxlength: 40 },
    policyText: { type: String, required: true, trim: true, maxlength: 30000 },
    active: { type: Boolean, default: false, required: true },
  }, { timestamps: true })
  schema.index({ active: 1 }, { unique: true, partialFilterExpression: { active: true } })
  return schema
}

export function createAcceptanceSchema(actorField, policyModel) {
  const schema = new mongoose.Schema({
    [actorField]: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    policyId: { type: mongoose.Schema.Types.ObjectId, ref: policyModel, required: true },
    policyVersion: { type: String, required: true, trim: true, maxlength: 40 },
    acceptedAt: { type: Date, required: true, default: Date.now },
  }, { timestamps: true })
  schema.index({ [actorField]: 1, policyId: 1 }, { unique: true })
  return schema
}
