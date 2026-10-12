import mongoose from 'mongoose'
import { env } from './env.js'
import { DATABASE_STARTUP_TIMEOUT_MS, withDatabaseStartupDeadline } from './database-startup.js'

export async function connectDatabase() {
  if (env.NODE_ENV === 'production') {
    console.info(`MongoDB connection attempt started (production; deadline ${DATABASE_STARTUP_TIMEOUT_MS}ms).`)
    await withDatabaseStartupDeadline(() => mongoose.connect(env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000,
    }))
    console.info('MongoDB connected (production).')
    return
  }
  await mongoose.connect(env.MONGO_URI, { serverSelectionTimeoutMS: 5000 })
  console.info(`MongoDB connected: ${mongoose.connection.host}`)
}

export async function disconnectDatabase() {
  await mongoose.disconnect()
}
