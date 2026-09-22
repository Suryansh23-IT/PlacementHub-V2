export class AppError extends Error {
  constructor(message, { statusCode = 500, errorCode = 'INTERNAL_SERVER_ERROR', details } = {}) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
    this.errorCode = errorCode
    this.details = details
  }
}
