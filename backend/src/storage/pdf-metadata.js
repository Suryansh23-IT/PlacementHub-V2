import mongoose from 'mongoose'

// Add to the existing metadata schemas without changing legacy field requirements.
export function pdfStorageReference(categories) {
  const allowed = Array.isArray(categories) ? categories : [categories]
  return { type: new mongoose.Schema({
    provider: { type: String, required: true, enum: ['local', 'supabase'] },
    key: { type: String, required: true, validate: value => allowed.some(category => new RegExp(`^2027/${category}/[a-f\\d]{8}-[a-f\\d]{4}-4[a-f\\d]{3}-[89ab][a-f\\d]{3}-[a-f\\d]{12}\\.pdf$`).test(value)) },
  }, { _id: false }), default: undefined }
}
