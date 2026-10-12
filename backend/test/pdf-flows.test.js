import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises'
process.env.MONGO_URI = 'mongodb://localhost/placementhub-v2-test'
process.env.JWT_SECRET = 'synthetic-pdf-test-secret-long-enough'
const { createPdfStorage, publicPdfMetadata, sendPdfDownload, ACADEMIC_PDF_CATEGORIES, DRIVE_PDF_CATEGORIES } = await import('../src/storage/pdf-storage.js')
const { saveAcademicMarksheet, getAcademicMarksheet, getStudentDocumentForAdmin } = await import('../src/modules/students/student.service.js')
const { uploadParticipationLetter, getParticipationLetter, getAdminParticipationLetter } = await import('../src/modules/companies/company.service.js')
const { saveMyPlacementDriveDocument, getMyPlacementDriveDocument, getPlacementDriveDocumentForAdmin, submitMyPlacementDrive } = await import('../src/modules/placement-drives/placement-drive.service.js')
const { saveCompanyPhaseInstructionPdf, getCompanyPhaseInstructionPdf, getCompanyRecruitmentWorkspace } = await import('../src/modules/recruitment/recruitment-workspace.service.js')
const { savePlacementProof, getPlacementProof } = await import('../src/modules/placements/placement-record.service.js')
const { getStudentPlacementDriveDocument, getStudentCurrentPhaseInstructionPdf } = await import('../src/modules/applications/student-placement-drive.service.js')
const { toProfileResponse } = await import('../src/modules/students/student.controller.js')
const { toCompanyResponse } = await import('../src/modules/companies/company.controller.js')
const { toPlacementDriveResponse } = await import('../src/modules/placement-drives/placement-drive.controller.js')
const { publicRecord } = await import('../src/modules/placements/placement-record.controller.js')
const { StudentProfile } = await import('../src/modules/students/student.model.js')
const { Company } = await import('../src/modules/companies/company.model.js')
const { PlacementDrive } = await import('../src/modules/placement-drives/placement-drive.model.js')
const { PlacementRecord } = await import('../src/modules/placements/placement-record.model.js')
const { placementDriveSubmissionSchema } = await import('../src/modules/placement-drives/placement-drive.validation.js')
const pdf = Buffer.from('%PDF-1.7\nPDF flow fixture')
const file = { originalname: 'document.pdf', mimetype: 'application/pdf', buffer: pdf, size: pdf.length }
const categories = [...Object.values(ACADEMIC_PDF_CATEGORIES), 'participation-letter', ...Object.values(DRIVE_PDF_CATEGORIES), 'phase-instruction', 'placement-proof']
const cloudConfig = { NODE_ENV: 'production', STORAGE_PROVIDER: 'supabase', SUPABASE_STORAGE_BUCKET: 'placementhub-2027', MONGO_URI: 'mongodb://localhost/placementhub-v2-demo-2027', SUPABASE_URL: 'https://synthetic-project.supabase.co', SUPABASE_SECRET_KEY: ['sb', 'secret', 'synthetic_pdf_fixture'].join('_') }
const query = value => ({ select() { return this }, sort() { return this }, lean() { return this }, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject) } })
const safe = value => assert.doesNotMatch(JSON.stringify(value), /storageReference|storagePath|"provider"|"key"|2027\/(class|college|participation|company|drive|recruitment|phase|placement)/)

function domain(category, previous, storage) {
  const events = []; let failSave = false; let approved = true; let exists = true
  const doc = { _id: 'drive', userId: 'student', companyId: 'company', proposalStatus: category === 'phase-instruction' ? 'approved' : 'draft', lifecycleStatus: 'published', phases: [{ phaseNumber: 1 }], verificationStatus: 'verified', approvalStatus: 'approved', async save() { events.push('save'); if (failSave) throw new Error('DB save failed'); return this } }
  const studentType = Object.keys(ACADEMIC_PDF_CATEGORIES).find(key => ACADEMIC_PDF_CATEGORIES[key] === category)
  const driveType = Object.keys(DRIVE_PDF_CATEGORIES).find(key => DRIVE_PDF_CATEGORIES[key] === category)
  const deps = {
    pdfStorage: storage, onCleanupFailure: () => events.push('cleanup-failed'),
    profileModel: { findOneAndUpdate: async () => exists ? doc : Promise.reject(new Error('Profile lookup failed')) },
    companyModel: { findOneAndUpdate: async () => exists ? doc : Promise.reject(new Error('Company lookup failed')), findOne: () => query(approved ? { _id: 'company' } : null) },
    placementDriveModel: { findOne: () => query(exists ? doc : null) },
    recordModel: { findOne: async () => exists ? doc : null },
  }
  if (studentType) {
    if (studentType === 'collegeResult') doc.collegeResult = previous
    else doc[studentType] = { marksheet: previous }
  } else if (driveType) doc.documents = { [driveType]: previous }
  else if (category === 'participation-letter') doc.participationLetter = previous
  else if (category === 'phase-instruction') doc.phaseExecution = [{ phaseNumber: 1, instructionPdf: previous, instructions: 'Keep instructions' }]
  else { doc.proof = previous ? [previous] : []; doc.history = [] }
  const metadata = () => studentType ? studentType === 'collegeResult' ? doc.collegeResult : doc[studentType].marksheet : driveType ? doc.documents[driveType] : category === 'participation-letter' ? doc.participationLetter : category === 'phase-instruction' ? doc.phaseExecution[0].instructionPdf : doc.proof.at(-1)
  const save = (input = file) => studentType ? saveAcademicMarksheet('student', studentType, input, deps) : driveType ? saveMyPlacementDriveDocument('owner', 'drive', driveType, input, deps) : category === 'participation-letter' ? uploadParticipationLetter('owner', input, deps) : category === 'phase-instruction' ? saveCompanyPhaseInstructionPdf('owner', 'drive', 1, input, deps) : savePlacementProof('student', 'application', input, deps)
  return { doc, deps, events, save, metadata, failSave: () => { failSave = true }, deny: () => { approved = false; exists = false } }
}

async function fixture(t, category, provider) {
  const directory = await mkdtemp(path.join(tmpdir(), 'placementhub-e2b-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const objects = new Map(); const calls = []
  const client = {
    getBucket: async () => ({ data: { id: 'placementhub-2027', public: false } }),
    from: () => ({
      async upload(key, buffer) { calls.push('store'); objects.set(key, buffer); return { error: null } },
      async download(key) { return objects.has(key) ? { data: new Blob([objects.get(key)]) } : { error: { statusCode: 404 } } },
      async remove(keys) { calls.push('remove'); keys.forEach(key => objects.delete(key)); return { error: null } },
    }),
  }
  const config = provider === 'local' ? { NODE_ENV: 'test', RESUME_UPLOAD_DIR: directory } : cloudConfig
  const storage = createPdfStorage(config, category, provider === 'local' ? {} : { client })
  return { directory, objects, calls, config, storage }
}

for (const category of categories) {
  for (const provider of ['local', 'supabase']) test(`${category}: ${provider} upload/read, safe replacement or append, failed-save cleanup`, async t => {
    const f = await fixture(t, category, provider)
    const previous = { ...publicPdfMetadata({ originalName: 'old.pdf', mimeType: 'application/pdf', size: pdf.length, uploadedAt: new Date(0) }), ...await f.storage.store({ buffer: pdf, mimeType: file.mimetype }) }
    const original = await f.storage.read(previous)
    const d = domain(category, previous, f.storage)
    await d.save()
    const committed = d.metadata()
    assert.equal(committed.storageReference.provider, provider)
    assert.match(committed.storageReference.key, new RegExp(`^2027/${category}/`))
    assert.equal(Boolean(committed.storagePath), provider === 'local')
    assert.deepEqual(await f.storage.read(committed), pdf)
    safe(publicPdfMetadata(committed))
    if (category === 'placement-proof') { assert.equal(d.doc.proof.length, 2); assert.deepEqual(await f.storage.read(previous), original) }
    else await assert.rejects(f.storage.read(previous), { statusCode: 404 })
    d.failSave()
    const before = provider === 'local' ? (await readdir(f.directory)).sort() : [...f.objects.keys()].sort()
    await assert.rejects(d.save(), /DB save failed/)
    assert.deepEqual(provider === 'local' ? (await readdir(f.directory)).sort() : [...f.objects.keys()].sort(), before)
    assert.deepEqual(d.metadata(), committed)
    assert.deepEqual(await f.storage.read(committed), pdf)
    if (category === 'placement-proof') assert.equal(d.doc.proof.length, 2)
    await f.storage.remove(committed)
    await assert.rejects(f.storage.read(committed), { statusCode: 404 })
  })

  test(`${category}: legacy local metadata remains readable and replacement waits for save`, async t => {
    const f = await fixture(t, category, 'local')
    const nested = path.join(f.directory, 'existing'); await mkdir(nested)
    const storagePath = path.join(nested, 'legacy.pdf'); await writeFile(storagePath, pdf)
    const previous = { originalName: 'legacy.pdf', storagePath, mimeType: 'application/pdf', size: pdf.length }
    assert.deepEqual(await f.storage.read(previous), pdf)
    const d = domain(category, previous, f.storage)
    d.doc.save = async function () { assert.deepEqual(await readFile(storagePath), pdf); return this }
    await d.save()
    if (category === 'placement-proof') assert.deepEqual(await readFile(storagePath), pdf)
    else await assert.rejects(readFile(storagePath), { code: 'ENOENT' })
    const cloud = await fixture(t, category, 'supabase')
    await assert.rejects(cloud.storage.read(previous), { statusCode: 503 })
    await assert.rejects(cloud.storage.read(d.metadata()), { statusCode: 422 })
  })

  test(`${category}: invalid content/limits and missing or unauthorized domain never store`, async t => {
    const f = await fixture(t, category, 'supabase'); const d = domain(category, undefined, f.storage)
    for (const input of [undefined, { ...file, buffer: Buffer.from('invalid') }, { ...file, mimetype: 'text/plain' }, { ...file, originalname: 'document.txt' }, { ...file, buffer: Buffer.alloc(5242881) }]) await assert.rejects(d.save(input === undefined ? null : input))
    d.deny(); await assert.rejects(d.save())
    assert.equal(f.objects.size, 0); assert.equal(f.calls.length, 0)
  })
}

test('all replacement categories save before old cleanup, and cleanup errors never mask save results', async () => {
  for (const category of categories.filter(value => value !== 'placement-proof')) {
    const previous = { storageReference: { provider: 'supabase', key: 'old' } }; const events = []
    const storage = { async store() { events.push('store'); return { storageReference: { provider: 'supabase', key: 'new' } } }, async remove(metadata) { events.push(metadata.storageReference.key); throw new Error('synthetic cleanup failure') } }
    const d = domain(category, previous, storage)
    d.doc.save = async function () { events.push('save'); return this }
    await d.save(); assert.deepEqual(events, ['store', 'save', 'old']); assert.equal(d.metadata().storageReference.key, 'new')
    events.length = 0; d.doc.save = async () => { events.push('save'); throw new Error('DB save failed') }
    await assert.rejects(d.save(), /DB save failed/); assert.deepEqual(events, ['store', 'save', 'new']); assert.equal(d.metadata().storageReference.key, 'new')
  }
})

test('domain download resolvers preserve Student/Admin/Company access and DTO privacy for all PDFs', async () => {
  const metadata = { originalName: 'document.pdf', storagePath: '/internal', storageReference: { provider: 'supabase', key: 'internal' }, mimeType: 'application/pdf', size: pdf.length, uploadedAt: new Date(0) }
  const userModel = { findOne: () => query({ _id: 'student' }) }
  for (const [type, category] of Object.entries(ACADEMIC_PDF_CATEGORIES)) {
    const d = domain(category, metadata)
    assert.equal(await getAcademicMarksheet('student', type, d.deps), metadata)
    assert.equal(await getStudentDocumentForAdmin('student', type, { ...d.deps, userModel }), metadata)
    safe(toProfileResponse(d.doc, { includeResumeDownloadUrl: true }))
    await assert.rejects(getStudentDocumentForAdmin('missing', type, { ...d.deps, userModel: { findOne: () => query(null) } }), { statusCode: 404 })
  }
  const letter = domain('participation-letter', metadata)
  assert.equal(await getParticipationLetter('owner', letter.deps), metadata)
  assert.equal(await getAdminParticipationLetter('owner', { ...letter.deps, userModel: { findOne: () => query({ _id: 'owner' }) } }), metadata)
  safe(toCompanyResponse(letter.doc))
  for (const [type, category] of Object.entries(DRIVE_PDF_CATEGORIES)) {
    const d = domain(category, metadata)
    assert.equal(await getMyPlacementDriveDocument('owner', 'drive', type, d.deps), metadata)
    assert.equal(await getPlacementDriveDocumentForAdmin('drive', type, d.deps), metadata)
    assert.equal(await getStudentPlacementDriveDocument('student', 'drive', type, d.deps), metadata)
    safe(toPlacementDriveResponse(d.doc))
    d.deny(); await assert.rejects(getMyPlacementDriveDocument('other', 'drive', type, d.deps), { statusCode: 403 })
    await assert.rejects(getStudentPlacementDriveDocument('student', 'drive', type, d.deps), { statusCode: 404 })
  }
  const phase = domain('phase-instruction', metadata)
  assert.equal(await getCompanyPhaseInstructionPdf('owner', 'drive', 1, phase.deps), metadata)
  const phaseDeps = { ...phase.deps, applicationModel: { findOne: async filter => filter.studentId === 'student' ? { _id: 'app', placementDriveId: 'drive', currentPhase: 1, currentStatus: 'active' } : null } }
  assert.equal(await getStudentCurrentPhaseInstructionPdf('student', 'app', phaseDeps), metadata)
  await assert.rejects(getStudentCurrentPhaseInstructionPdf('other', 'app', phaseDeps), { statusCode: 404 })
  safe(await getCompanyRecruitmentWorkspace('owner', 'drive', { ...phase.deps, applicationModel: { find: () => [] } }))
  safe(toPlacementDriveResponse(phase.doc))
  const proof = domain('placement-proof', metadata)
  proof.deps.recordModel.findOne = async filter => filter.studentId === 'student' || !filter.studentId ? proof.doc : null
  assert.equal(await getPlacementProof('student', 'record', 0, proof.deps), metadata)
  assert.equal(await getPlacementProof('admin', 'record', 0, { ...proof.deps, isAdmin: true }), metadata)
  await assert.rejects(getPlacementProof('other', 'record', 0, proof.deps), { statusCode: 404 })
  safe(publicRecord(proof.doc))
  const response = { attachment(name) { assert.equal(name, metadata.originalName) }, type(mime) { assert.equal(mime, 'application/pdf') }, send(bytes) { return bytes } }
  assert.deepEqual(await sendPdfDownload(response, metadata, 'placement-proof', { read: async () => pdf }), pdf)
})

test('PDF model and submission validation accept private references while retaining legacy metadata', async () => {
  const id = '507f1f77bcf86cd799439001'; const uuid = '12345678-1234-4234-8234-123456789abc'
  const base = { originalName: 'document.pdf', mimeType: 'application/pdf', size: pdf.length, uploadedAt: new Date(0) }
  for (const category of categories) {
    const reference = { provider: 'supabase', key: `2027/${category}/${uuid}.pdf` }
    const type = Object.keys(ACADEMIC_PDF_CATEGORIES).find(key => ACADEMIC_PDF_CATEGORIES[key] === category)
    const driveType = Object.keys(DRIVE_PDF_CATEGORIES).find(key => DRIVE_PDF_CATEGORIES[key] === category)
    for (const metadata of [{ ...base, storagePath: '/legacy/document.pdf' }, { ...base, storageReference: reference }]) {
      if (type) {
        const model = new StudentProfile({ userId: id, ...(type === 'collegeResult' ? { collegeResult: metadata } : { [type]: { marksheet: metadata } }) })
        await model.validate(); assert.equal(type === 'collegeResult' ? model.collegeResult.originalName : model[type].marksheet.originalName, base.originalName)
      } else if (category === 'participation-letter') {
        const model = new Company({ userId: id, participationLetter: metadata }); await model.validate(); assert.deepEqual(publicPdfMetadata(model.participationLetter), base)
      } else if (category === 'placement-proof') {
        const model = new PlacementRecord({ studentId: id, placementSource: 'OFF_CAMPUS', outcomeType: 'full_time', verificationState: 'confirmed', proof: [metadata] }); assert.equal(model.proof[0].storageReference?.key, metadata.storageReference?.key)
        await model.proof[0].validate()
      } else {
        const model = new PlacementDrive({ companyId: id, ...(driveType ? { documents: { [driveType]: metadata } } : { phaseExecution: [{ phaseNumber: 1, instructionPdf: metadata }] }) })
        const document = driveType ? model.documents[driveType] : model.phaseExecution[0].instructionPdf
        await document.validate(); assert.equal(document.storageReference?.key, metadata.storageReference?.key)
      }
    }
  }
  const draft = {
    role: { title: 'Software Engineer', employmentType: 'full_time', description: 'Build useful systems.' },
    driveDetails: { applicationDeadline: new Date('2027-12-01'), expectedHires: 2, workLocation: 'Pune', workMode: 'offline', joiningPeriod: 'June 2027' },
    eligibility: { allowedBranches: ['IT'], minimumCgpa: 6, maximumActiveBacklogs: 0, graduationYears: [2027] },
    phases: [{ phaseNumber: 1, title: 'Interview', type: 'technical_interview' }],
  }
  const proposal = { ...draft, _id: 'drive', proposalStatus: 'draft', documents: Object.fromEntries(Object.entries(DRIVE_PDF_CATEGORIES).map(([type, category]) => [type, { ...base, storageReference: { provider: 'supabase', key: `2027/${category}/${uuid}.pdf` } }])), async save() { return this } }
  assert.equal(placementDriveSubmissionSchema.safeParse(proposal).success, true)
  const submitted = await submitMyPlacementDrive('owner', 'drive', {
    companyModel: { findOne: () => query({ _id: 'company' }) }, placementDriveModel: { findOne: async () => proposal },
    institutionService: async () => ({ branches: ['IT'] }),
    policyDependencies: { policyModel: { findOne: async () => ({ _id: 'policy', version: '1.0' }) }, acceptanceModel: { findOne: async () => ({ companyId: 'owner', policyId: 'policy', policyVersion: '1.0' }) } },
  })
  assert.equal(submitted.proposalStatus, 'submitted')
})

test('proof rollback retains existing proofs/history when new-file cleanup itself fails', async () => {
  const previous = { originalName: 'old.pdf', storagePath: '/existing/old.pdf' }
  const removed = []
  const storage = { store: async () => ({ storageReference: { provider: 'supabase', key: 'new' } }), async remove(metadata) { removed.push(metadata.storageReference.key); throw new Error('cleanup unavailable') } }
  const d = domain('placement-proof', previous, storage)
  d.failSave(); await assert.rejects(d.save(), /DB save failed/)
  assert.deepEqual(d.doc.proof, [previous]); assert.deepEqual(d.doc.history, [])
  assert.deepEqual(removed, ['new']); assert.deepEqual(d.events, ['save', 'cleanup-failed'])
})
