export function sendSuccess(response, { statusCode = 200, message, data = null }) {
  return response.status(statusCode).json({ success: true, message, data })
}

export function sendError(response, { statusCode, message, errorCode, details }) {
  return response.status(statusCode).json({
    success: false,
    message,
    errorCode,
    ...(details ? { details } : {}),
  })
}
