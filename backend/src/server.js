import { app } from './app.js'
import { connectDatabase, disconnectDatabase } from './config/database.js'
import { env } from './config/env.js'

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
  console.error('Failed to start PlacementHub API:', error)
  process.exit(1)
})
