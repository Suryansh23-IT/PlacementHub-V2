import { AiProviderError } from '../ai.errors.js'

export async function boundedBody(response, maxBytes) {
  if (Number(response.headers.get('content-length')) > maxBytes) { await response.body?.cancel(); throw new AiProviderError('invalid_output') }
  if (!response.body) throw new AiProviderError('invalid_output')
  const reader = response.body.getReader(); const chunks = []; let total = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) { await reader.cancel(); throw new AiProviderError('invalid_output') }
      chunks.push(Buffer.from(value))
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } finally { reader.releaseLock() }
}
