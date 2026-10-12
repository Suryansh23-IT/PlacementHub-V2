import { app } from './app.js'
import { connectDatabase, disconnectDatabase } from './config/database.js'
import { env } from './config/env.js'
import { DatabaseStartupError } from './config/database-startup.js'

async function startServer() {
  await connectDatabase()
  const server = app.listen(env.PORT, () => {
    console.info(`PlacementHub API listening on port ${env.PORT}`)
  })

  async function shutDown(signal) {
    console.info(`${signal} received. Shutting down gracefully.`)
    server.close(async () => {
      await disconnectDatabase()
      process.exit(0)
    })
  }

  process.on('SIGINT', () => shutDown('SIGINT'))
  process.on('SIGTERM', () => shutDown('SIGTERM'))
}

startServer().catch((error) => {
  console.error('Failed to start PlacementHub API:', env.NODE_ENV === 'production'
    ? { category: error instanceof DatabaseStartupError ? error.category : 'STARTUP_FAILURE', message: 'Startup failed. Check backend configuration and database availability.' }
    : error)
  process.exit(1)
})
