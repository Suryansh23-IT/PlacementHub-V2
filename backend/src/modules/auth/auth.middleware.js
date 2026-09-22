import { AppError } from '../../errors/app-error.js'
import { User } from './auth.model.js'
import { verifyAccessToken } from './auth.service.js'

export function createAuthenticate({ userModel = User } = {}) {
  return async (request, response, next) => {
    const authorization = request.headers.authorization
    if (!authorization?.startsWith('Bearer ')) {
      return next(new AppError('Authentication is required.', { statusCode: 401, errorCode: 'UNAUTHENTICATED' }))
    }

    const payload = verifyAccessToken(authorization.slice(7))
    const user = await userModel.findById(payload.sub).select('_id name email role isActive')
    if (!user || !user.isActive) {
      return next(new AppError('Your account is unavailable.', { statusCode: 401, errorCode: 'UNAUTHENTICATED' }))
    }

    request.user = user
    return next()
  }
}

export const authenticate = createAuthenticate()

export function authorizeRoles(...roles) {
  return (request, response, next) => {
    if (!request.user) {
      return next(new AppError('Authentication is required.', { statusCode: 401, errorCode: 'UNAUTHENTICATED' }))
    }
    if (!roles.includes(request.user.role)) {
      return next(new AppError('You are not authorized to perform this action.', { statusCode: 403, errorCode: 'FORBIDDEN' }))
    }
    return next()
  }
}
