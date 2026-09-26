import mongoose from 'mongoose'

const demoSeedStoreSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  status: { type: String, required: true, enum: ['starting', 'ready'], default: 'starting' },
  studentUserIds: [{ type: mongoose.Schema.Types.ObjectId }],
  companyUserIds: [{ type: mongoose.Schema.Types.ObjectId }],
  companyProfileIds: [{ type: mongoose.Schema.Types.ObjectId }],
  createdRecruiterPolicyId: { type: mongoose.Schema.Types.ObjectId },
  pdfDirectory: { type: String, required: true },
}, { timestamps: true })

export const DemoSeedStore = mongoose.models.DemoSeedStore ?? mongoose.model('DemoSeedStore', demoSeedStoreSchema)
export const DEMO_SEED_KEY = 'placementhub-v2-dev-demo-v1'
