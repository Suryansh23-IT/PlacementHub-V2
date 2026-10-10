import { open, realpath } from 'node:fs/promises'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import { assertAiRuntime } from './ai.guard.js'
import { fingerprint } from './ai.context.js'

export const RESUME_TEXT_VERSION = 'professional-sections-1'
export function resumeRevision(resume) {
  return fingerprint(resume ? { path: resume.storagePath, size: resume.size, uploadedAt: resume.uploadedAt instanceof Date ? resume.uploadedAt.toISOString() : String(resume.uploadedAt) } : null)
}
const professionalHeading = /^(?:technical skills|skills|technical expertise|projects|academic projects|professional projects|experience|work experience|professional experience|internships?|certifications?|credentials|technical achievements|professional summary|summary|objective|career objective|profile|education|academic qualifications)\s*[:|]?\s*$/i
const privateHeading = /^(?:personal(?: details| information)?|contact(?: details| information)?|hobbies|interests|extra.?curricular.*|activities|references|declaration|languages|personality|social.*|achievements|awards)\s*[:|]?\s*$/i
const privateLine = /\b(?:gender|sex|marital|date of birth|dob|father|mother|address|nationality|religion|mbti|hobb(?:y|ies)|personality|community|likes|followers)\b/i

// Only recognized professional sections survive. Header/name/contact and
// unrecognized personal sections are omitted rather than sent as raw PDF text.
export function sanitizeResumeText(raw) {
  let allowed = false; const lines = []
  for (const original of String(raw).normalize('NFKC').split(/\r?\n/)) {
    const line = original.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
    if (!line) continue
    if (professionalHeading.test(line)) { allowed = true; lines.push(line); continue }
    if (privateHeading.test(line)) { allowed = false; continue }
    if (!allowed || privateLine.test(line)) continue
    const safe = line.replace(/https?:\/\/\S+|www\.\S+/gi, '[link]').replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[contact]').replace(/(?:\+?\d[\d ().-]{7,}\d)/g, '[contact]')
    lines.push(safe)
  }
  return lines.join('\n').slice(0, 5000)
}

export function parseResumePdf(bytes, { timeoutMs = 8000 } = {}) {
  return new Promise(resolve => {
    const worker = new Worker(new URL('./resume-text.worker.js', import.meta.url), { workerData: bytes, resourceLimits: { maxOldGenerationSizeMb: 96, maxYoungGenerationSizeMb: 16 }, stdout: true, stderr: true })
    let done = false
    const finish = value => { if (done) return; done = true; clearTimeout(timer); void worker.terminate(); resolve(value) }
    const timer = setTimeout(() => finish({ failed: true }), timeoutMs)
    worker.on('message', finish); worker.on('error', () => finish({ failed: true })); worker.on('exit', () => finish({ failed: true }))
  })
}

export function createResumeTextService(config, { parsePdf = parseResumePdf, now = Date.now } = {}) {
  assertAiRuntime(config)
  const cache = new Map(); const pending = new Map()
  return {
    async extract(resume) {
      assertAiRuntime(config)
      if (!resume) return { status: 'not_uploaded', text: '' }
      if (!config.AI_ENABLED) return { status: 'unavailable', text: '' }
      const revision = resumeRevision(resume)
      const hit = cache.get(revision)
      if (hit && hit.expires > now()) return structuredClone(hit.value)
      if (pending.has(revision)) return structuredClone(await pending.get(revision))
      if (pending.size >= 1) return { status: 'unavailable', text: '' }
      const task = (async () => {
        let file
        try {
          const root = await realpath(path.resolve(config.RESUME_UPLOAD_DIR))
          const target = await realpath(path.resolve(resume.storagePath))
          const relative = path.relative(root, target)
          if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || path.extname(target).toLowerCase() !== '.pdf') throw new Error('Unsafe document')
          file = await open(target, 'r')
          const stat = await file.stat()
          if (!stat.isFile() || stat.size > Math.min(config.RESUME_MAX_FILE_SIZE_BYTES ?? 5 * 1024 * 1024, 5 * 1024 * 1024)) throw new Error('Document limit')
          const bytes = await file.readFile()
          if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('Invalid document')
          const parsed = await parsePdf(bytes)
          if (parsed.failed) return { status: 'unreadable', text: '' }
          const text = sanitizeResumeText(parsed.text)
          return text.length >= 40 ? { status: 'extracted', text, truncated: parsed.text.length > 5000 || stat.size > 0 && parsed.text.length >= 30000 } : { status: 'no_usable_text', text: '' }
        } catch { return { status: 'unreadable', text: '' } }
        finally { await file?.close().catch(() => {}) }
      })()
      pending.set(revision, task)
      try {
        const value = await task
        // Safe professional excerpts only, short TTL; never raw PDF/paths/prompts.
        if (cache.size >= 20) cache.delete(cache.keys().next().value)
        cache.set(revision, { value, expires: now() + 300000 })
        return structuredClone(value)
      } finally { pending.delete(revision) }
    },
  }
}
