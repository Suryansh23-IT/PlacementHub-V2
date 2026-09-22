import { AppError } from '../errors/app-error.js'

export function notFound(request, response, next) {
  next(
    new AppError(`Route ${request.method} ${request.originalUrl} was not found.`, {
      statusCode: 404,
      errorCode: 'NOT_FOUND',
    }),
  )
}
