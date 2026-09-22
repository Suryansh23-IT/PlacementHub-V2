import mongoose from 'mongoose'
import { env } from './env.js'

export async function connectDatabase() {
  await mongoose.connect(env.MONGO_URI, { serverSelectionTimeoutMS: 5000 })
  console.info(`MongoDB connected: ${mongoose.connection.host}`)
}

export async function disconnectDatabase() {
  await mongoose.disconnect()
}
