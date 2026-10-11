import mongoose from 'mongoose'

export const hasStoredImage = image => Boolean(image?.filename || image?.storageReference)

export function imageStorageReference(category) {
  return { type: new mongoose.Schema({
    provider: { type: String, required: true, enum: ['local', 'supabase'] },
    key: { type: String, required: true, match: new RegExp(`^2027/${category}/[a-f\\d]{8}-[a-f\\d]{4}-4[a-f\\d]{3}-[89ab][a-f\\d]{3}-[a-f\\d]{12}\\.(jpg|png|webp)$`) },
  }, { _id: false }), default: undefined }
}
