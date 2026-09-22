import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { timingSafeEqual } from 'node:crypto'
import { env } from '../../config/env.js'
import { AppError } from '../../errors/app-error.js'
import { User } from './auth.model.js'
import { USER_ROLES } from './auth.constants.js'

function createAccessToken(user) {
  return jwt.sign({ role: user.role }, env.JWT_SECRET, {
    subject: user._id.toString(),
    expiresIn: env.JWT_EXPIRES_IN,
  })
}

function toAuthData(user) {
  return {
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
    },
    accessToken: createAccessToken(user),
  }
}

function secretsMatch(candidate, expected) {
  const candidateBuffer = Buffer.from(candidate ?? '')
  const expectedBuffer = Buffer.from(expected)
  return candidateBuffer.length === expectedBuffer.length && timingSafeEqual(candidateBuffer, expectedBuffer)
}

async function assertAdminBootstrapAllowed(secret, userModel) {
  if (!env.ADMIN_BOOTSTRAP_SECRET || !secretsMatch(secret, env.ADMIN_BOOTSTRAP_SECRET)) {
    throw new AppError('Placement Admin registration is not authorized.', { statusCode: 403, errorCode: 'FORBIDDEN' })
  }

  if (await userModel.exists({ role: USER_ROLES.PLACEMENT_ADMIN })) {
    throw new AppError('The Placement Admin account already exists.', { statusCode: 409, errorCode: 'CONFLICT' })
  }
}

export async function registerUser(input, { userModel = User } = {}) {
  if (await userModel.exists({ email: input.email })) {
    throw new AppError('An account with this email already exists.', { statusCode: 409, errorCode: 'CONFLICT' })
  }

  if (input.role === USER_ROLES.PLACEMENT_ADMIN) {
    await assertAdminBootstrapAllowed(input.adminBootstrapSecret, userModel)
  }

  const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_SALT_ROUNDS)
  let user
  try {
    user = await userModel.create({ name: input.name, email: input.email, passwordHash, role: input.role })
  } catch (error) {
    if (error?.code === 11000) {
      throw new AppError('An account with these details already exists.', { statusCode: 409, errorCode: 'CONFLICT' })
    }
    throw error
  }
  return toAuthData(user)
}

export async function loginUser(input, { userModel = User } = {}) {
  const user = await userModel.findOne({ email: input.email }).select('+passwordHash')
  const passwordMatches = user ? await bcrypt.compare(input.password, user.passwordHash) : false

  if (!user || !passwordMatches) {
    throw new AppError('Email or password is incorrect.', { statusCode: 401, errorCode: 'UNAUTHENTICATED' })
  }
  if (!user.isActive) {
    throw new AppError('This account is inactive.', { statusCode: 403, errorCode: 'FORBIDDEN' })
  }

  return toAuthData(user)
}

export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, env.JWT_SECRET)
  } catch {
    throw new AppError('Your session is invalid or has expired.', { statusCode: 401, errorCode: 'UNAUTHENTICATED' })
  }
}
