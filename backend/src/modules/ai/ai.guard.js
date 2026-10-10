import { AppError } from '../../errors/app-error.js'

export function isAiRuntime(config) {
  try { return new URL(config.MONGO_URI).pathname === '/placementhub-v2-demo-2027' } catch { return false }
}

export function assertAiRuntime(config) {
  if (!isAiRuntime(config)) throw new AppError('AI is unavailable in this placement cycle.', { statusCode: 404, errorCode: 'NOT_FOUND' })
}
