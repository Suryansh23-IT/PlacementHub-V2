import mongoose from 'mongoose'
import { sendSuccess } from '../../utils/api-response.js'

export function getHealth(request, response) {
  const databaseConnected = mongoose.connection.readyState === 1

  return sendSuccess(response, {
    message: databaseConnected ? 'PlacementHub API is healthy.' : 'PlacementHub API is running without a database connection.',
    data: { service: 'placementhub-api', databaseConnected },
  })
}
