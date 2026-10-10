import { parentPort, workerData } from 'node:worker_threads'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

// Parsing runs off the request thread and can be terminated. No URLs, scripts,
// attachments, annotations, images, OCR or document metadata are processed.
try {
  const task = getDocument({ data: new Uint8Array(workerData), isEvalSupported: false, useSystemFonts: false, disableFontFace: true, verbosity: 0 })
  const pdf = await task.promise
  const lines = []; let length = 0
  for (let number = 1; number <= Math.min(pdf.numPages, 10) && length < 30000; number++) {
    const page = await pdf.getPage(number)
    const content = await page.getTextContent()
    let line = ''
    for (const item of content.items) {
      if (typeof item.str !== 'string') continue
      line += `${item.str} `
      if (item.hasEOL) { lines.push(line.trim()); length += line.length; line = '' }
      if (length + line.length >= 30000) break
    }
    if (line) { lines.push(line.trim()); length += line.length }
    page.cleanup()
  }
  await task.destroy()
  parentPort.postMessage({ text: lines.join('\n').slice(0, 30000) })
} catch { parentPort.postMessage({ failed: true }) }
