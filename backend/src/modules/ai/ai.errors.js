export class AiProviderError extends Error {
  constructor(code = 'unavailable') {
    super('AI analysis is temporarily unavailable.')
    this.name = 'AiProviderError'
    this.code = code
  }
}

export function unavailable(reason) {
  return { status: 'unavailable', reason, message: 'AI analysis is temporarily unavailable. Normal placement workflows remain available.' }
}
