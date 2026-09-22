import { sendSuccess } from '../../utils/api-response.js'
import { loginUser, registerUser } from './auth.service.js'

export async function register(request, response) {
  const data = await registerUser(request.body)
  return sendSuccess(response, { statusCode: 201, message: 'Account created successfully.', data })
}

export async function login(request, response) {
  const data = await loginUser(request.body)
  return sendSuccess(response, { message: 'Logged in successfully.', data })
}

export function getMe(request, response) {
  return sendSuccess(response, {
    message: 'Current user retrieved successfully.',
    data: {
      id: request.user._id.toString(),
      name: request.user.name,
      email: request.user.email,
      role: request.user.role,
    },
  })
}
