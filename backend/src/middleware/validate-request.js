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
