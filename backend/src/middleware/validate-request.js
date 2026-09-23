export function validateBody(schema) {
  return (request, response, next) => {
    const result = schema.safeParse(request.body)

    if (!result.success) {
      return next(result.error)
    }

    request.body = result.data
    return next()
  }
}

export function validateParams(schema) {
  return (request, response, next) => {
    const result = schema.safeParse(request.params)

    if (!result.success) {
      return next(result.error)
    }

    request.params = result.data
    return next()
  }
}
