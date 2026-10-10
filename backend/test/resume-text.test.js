import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { sanitizeResumeText, createResumeTextService, parseResumePdf } from '../src/modules/ai/resume-text.service.js'

function pdf(lines) {
  const stream = `BT /F1 12 Tf 50 750 Td ${lines.map((line, index) => `${index ? '0 -20 Td ' : ''}(${line.replace(/[()\\]/g, '\\$&')}) Tj`).join('\n')} ET`
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`]
  let body = '%PDF-1.4\n'; const offsets = [0]
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(body)); body += `${index + 1} 0 obj\n${object}\nendobj\n` })
  const offset = Buffer.byteLength(body)
  body += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(value => `${String(value).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF`
  return Buffer.from(body)
}
test('real PDF text extraction filters identity, contacts and social/personal sections', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'placementhub-resume-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const file = path.join(directory, 'resume.pdf')
  await writeFile(file, pdf(['PRIVATE NAME', 'private@example.test', 'Projects', 'Built SQL APIs using Node.js with response time measured.', 'Technical Skills', 'SQL JavaScript Git', 'Hobbies', 'PRIVATE singing', 'Personal Details', 'Gender PRIVATE']))
  const service = createResumeTextService({ MONGO_URI: 'mongodb://localhost/placementhub-v2-demo-2027', AI_ENABLED: true, RESUME_UPLOAD_DIR: directory, RESUME_MAX_FILE_SIZE_BYTES: 100000 })
  const result = await service.extract({ storagePath: file, size: 1000, uploadedAt: 'revision-1' })
  assert.equal(result.status, 'extracted'); assert.match(result.text, /SQL APIs/)
  assert(!/PRIVATE|private@|singing|Gender|storagePath/.test(JSON.stringify(result)))
})
test('image-only/unreadable PDFs and parsing timeout fail without invented text', async () => {
  const blank = await parseResumePdf(pdf([])); assert.equal(sanitizeResumeText(blank.text), '')
  assert.equal((await parseResumePdf(Buffer.from('%PDF-invalid'))).failed, true)
  assert.equal((await parseResumePdf(pdf(['Projects']), { timeoutMs: 1 })).failed, true)
})
test('professional resume normalization is bounded and excludes contact/private information', () => {
  const result = sanitizeResumeText(`Name\nHobbies\nMusic\nProjects\nBuilt service private@example.test https://private.test +91 9876543210\n${'Node API '.repeat(1000)}\nMBTI INTJ`)
  assert(result.length <= 5000); assert(!/Music|Name|private@|private.test|9876543210|INTJ/.test(result))
})
test('path containment, size, cache reuse/revision and exact cycle guard', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'placementhub-path-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const file = path.join(directory, 'resume.pdf'); await writeFile(file, pdf(['Projects', 'Built reliable SQL and REST APIs for a professional project.']))
  let calls = 0
  const config = { MONGO_URI: 'mongodb://localhost/placementhub-v2-demo-2027', AI_ENABLED: true, RESUME_UPLOAD_DIR: directory, RESUME_MAX_FILE_SIZE_BYTES: 100000 }
  const service = createResumeTextService(config, { parsePdf: async () => { calls++; return { text: 'Projects\nBuilt reliable SQL and REST APIs for a professional project.' } } })
  const resume = { storagePath: file, uploadedAt: 1 }
  await service.extract(resume); await service.extract(resume); assert.equal(calls, 1)
  await service.extract({ ...resume, uploadedAt: 2 }); assert.equal(calls, 2)
  assert.equal((await service.extract({ storagePath: path.join(directory, '..', 'foreign.pdf') })).status, 'unreadable')
  assert.equal((await createResumeTextService({ ...config, RESUME_MAX_FILE_SIZE_BYTES: 10 }).extract(resume)).status, 'unreadable')
  assert.throws(() => createResumeTextService({ ...config, MONGO_URI: 'mongodb://localhost/placementhub-v2' }), { errorCode: 'NOT_FOUND' })
  // When Windows grants symlink privilege, resolved external targets also fail.
  const link = path.join(directory, 'link.pdf')
  try { await symlink(path.resolve('../README.md'), link); assert.equal((await service.extract({ storagePath: link })).status, 'unreadable') } catch (error) { if (error.code !== 'EPERM') throw error }
})
