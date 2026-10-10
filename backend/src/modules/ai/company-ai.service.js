import { randomUUID } from 'node:crypto'
import { User } from '../auth/auth.model.js'
import { Company } from '../companies/company.model.js'
import { PlacementDrive } from '../placement-drives/placement-drive.model.js'
import { Application } from '../applications/application.model.js'
import { StudentProfile } from '../students/student.model.js'
import { AppError } from '../../errors/app-error.js'
import { assertAiRuntime } from './ai.guard.js'
import { buildSafeContext, fingerprint } from './ai.context.js'
import { createAiService } from './ai.service.js'
import { providerIdentity } from './providers/ai.provider.js'
import { createResumeTextService, resumeRevision } from './resume-text.service.js'
import { PROFESSIONAL_FIELDS } from './student-ai.service.js'
import { calculateDriveMatch } from './student-ai.scoring.js'
import { enrichStudentContext } from './student-ai.context.js'
import { qualityContext, assessmentScore } from './student-ai.assessment.js'
import { companyFitContract, groupQuestionContract } from './company-ai.schemas.js'
import { createQuestionContract, safeQuestion } from './ai-question.js'
import { companyResumeEvidence } from './company-ai.resume.js'
import { retrieveCandidates, compactCandidate } from './company-ai.retrieval.js'

const denied = () => new AppError('Candidate or owned drive was not found.', { statusCode: 404, errorCode: 'NOT_FOUND' })
const invalid = message => new AppError(message, { statusCode: 422, errorCode: 'VALIDATION_ERROR' })
export function companyLimits(config) { const cap = config.AI_PROVIDER === 'ollama' ? 5 : 20; return { batch: Math.min(config.AI_BATCH_LIMIT ?? 4, cap), group: Math.min(config.AI_GROUP_LIMIT ?? 4, cap) } }
function companyContext(safe, drive, company, resume) {
  const context = enrichStudentContext(safe, drive, company, companyResumeEvidence(resume))
  // Company semantic review concerns professional work, never eligibility.
  if (context.drive) delete context.drive.eligibilityCriteria
  return context
}

export function createCompanyIntelligence(config, { userModel = User, companyModel = Company, driveModel = PlacementDrive, applicationModel = Application, profileModel = StudentProfile, aiService, aiDependencies, resumeTextService, now = Date.now, delay = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  assertAiRuntime(config)
  const ai = aiService ?? createAiService(config, aiDependencies)
  const extractor = resumeTextService ?? createResumeTextService(config)
  const latest = new Map(); const jobs = new Map(); const running = new Map(); const queue = []; let draining = false
  async function owned(actor, driveId) {
    assertAiRuntime(config)
    if (actor?.role !== 'company') throw denied()
    const user = await userModel.findOne({ _id: actor._id, role: 'company', isActive: true }).select('_id').lean()
    if (!user) throw denied()
    const company = await companyModel.findOne({ userId: actor._id, approvalStatus: 'approved' }).select('_id companyName industry description roleDomains technologies productsServices').lean()
    if (!company) throw denied()
    const drive = await driveModel.findOne({ _id: driveId, companyId: company._id, proposalStatus: 'approved', lifecycleStatus: 'published' }).select('role driveDetails eligibility phases companyId').lean()
    if (!drive) throw denied()
    return { company, drive }
  }
  async function candidate(actor, driveId, studentId) {
    const { company, drive } = await owned(actor, driveId)
    const application = await applicationModel.findOne({ placementDriveId: driveId, studentId }).select('_id').lean()
    if (!application) throw denied()
    const [user, profile] = await Promise.all([userModel.findOne({ _id: studentId, role: 'student' }).select('_id name').lean(), profileModel.findOne({ userId: studentId }).select(PROFESSIONAL_FIELDS).lean()])
    if (!user || !profile) throw denied()
    const context = buildSafeContext({ profile }).context
    const objective = calculateDriveMatch(buildSafeContext({ profile, drive }, { kind: 'match' }).context)
    const rich = companyContext({ ...context, kind: 'match', drive: buildSafeContext({ profile, drive }, { kind: 'match' }).context.drive }, drive, company, { status: 'revision_only' })
    const revision = fingerprint({ rich, resumeRevision: resumeRevision(profile.resume), provider: providerIdentity(config), version: companyFitContract.version })
    const key = fingerprint({ actor: String(actor._id), driveId, studentId })
    return { profile, drive, company, context: rich, objective, revision, key, studentId, name: user.name, applicationId: String(application._id) }
  }
  function prior(row) { const hit = latest.get(row.key); if (hit?.expires > now()) return { ...hit.assessment, stale: hit.revision !== row.revision }; latest.delete(row.key); return null }
  function result(row, provider = { status: 'not_requested' }, resume) { return { studentId: row.studentId, driveId: String(row.drive._id), applicationId: row.applicationId, deterministic: row.objective, assessment: prior(row), ai: provider, resumeStatus: resume?.status ?? prior(row)?.resumeStatus ?? (row.profile.resume ? 'not_analyzed' : 'not_uploaded') } }
  async function read(actor, driveId, studentId) { return result(await candidate(actor, driveId, studentId)) }
  async function analyze(actor, driveId, studentId, refresh = true) {
    const row = await candidate(actor, driveId, studentId)
    if (!refresh && prior(row) && !prior(row).stale) return result(row, { status: 'available', cached: true })
    const taskKey = `${row.key}:${row.revision}`
    if (running.has(taskKey)) { await running.get(taskKey); return read(actor, driveId, studentId) }
    const task = (async () => {
      const resume = companyResumeEvidence(await extractor.extract(row.profile.resume))
      const provider = await ai.analyze({ actor, scope: `company:${driveId}:${studentId}:fit`, kind: 'match', resumeDependent: true, scoringVersion: companyFitContract.version, forceRefresh: refresh,
        authorize: async () => { await candidate(actor, driveId, studentId); return true }, loadContext: async () => ({ profile: row.profile, drive: row.drive }),
        enrichContext: () => qualityContext(companyContext(row.context, row.drive, row.company, resume)), contract: companyFitContract })
      const current = await candidate(actor, driveId, studentId)
      if (provider.status === 'available') {
        const assessment = { ...assessmentScore(provider.analysis, true), strengths: provider.analysis.strengths, gaps: provider.analysis.gaps, interviewerFocus: provider.analysis.interviewerFocus, analyzedAt: new Date(now()).toISOString(), resumeStatus: resume.status }
        if (latest.size >= (config.AI_CACHE_MAX_ENTRIES ?? 100) && !latest.has(row.key)) latest.delete(latest.keys().next().value)
        latest.set(row.key, { revision: row.revision, expires: now() + 86400000, assessment })
      }
      return result(current, provider, resume)
    })()
    running.set(taskKey, task)
    try { return await task } finally { running.delete(taskKey) }
  }
  async function ask(actor, driveId, studentId, question) {
    const row = await candidate(actor, driveId, studentId); const resume = companyResumeEvidence(await extractor.extract(row.profile.resume))
    const provider = await ai.analyze({ actor, scope: `company:${driveId}:${studentId}:ask`, kind: 'match', resumeDependent: true, authorize: async () => { await candidate(actor, driveId, studentId); return true }, loadContext: async () => ({ profile: row.profile, drive: row.drive }), enrichContext: () => ({ ...companyContext(row.context, row.drive, row.company, resume), userQuestion: safeQuestion(question) }), contract: createQuestionContract('this candidate’s documented professional fit for this role; no hiring decisions') })
    return { ai: provider }
  }
  async function cohort(actor, driveId) {
    const { drive, company } = await owned(actor, driveId)
    const applications = await applicationModel.find({ placementDriveId: driveId }).select('_id studentId').limit(501).lean()
    if (applications.length > 500) throw invalid('Use a narrower drive cohort; evidence retrieval is bounded to 500 applications.')
    const ids = applications.map(row => row.studentId)
    const [users, profiles] = await Promise.all([userModel.find({ _id: { $in: ids }, role: 'student' }).select('_id name').lean(), profileModel.find({ userId: { $in: ids } }).select(`userId ${PROFESSIONAL_FIELDS}`).lean()])
    const userMap = new Map(users.map(row => [String(row._id), row])); const profileMap = new Map(profiles.map(row => [String(row.userId), row]))
    return applications.flatMap(app => {
      const studentId = String(app.studentId); const profile = profileMap.get(studentId); const user = userMap.get(studentId)
      if (!profile || !user) return []
      const context = buildSafeContext({ profile }).context
      return [{ studentId, name: user.name, profile, context, resume: companyResumeEvidence(extractor.peek?.(profile.resume)), objective: calculateDriveMatch(buildSafeContext({ profile, drive }, { kind: 'match' }).context), drive, company }]
    })
  }
  async function groupAsk(actor, driveId, question) {
    const userQuestion = safeQuestion(question); const rows = await cohort(actor, driveId)
    const selected = retrieveCandidates(rows, userQuestion, companyLimits(config).group)
    if (!selected.length) return { ai: { status: 'available', analysis: { answer: 'Based on the documented evidence available, no matching professional evidence was found in the structured profiles or cached resume excerpts. This is not proof of inability.', candidateIds: [] } }, candidates: [], retrieval: 'structured profile + cached resume evidence' }
    const candidates = []
    for (const row of selected) candidates.push(compactCandidate(row, companyResumeEvidence(await extractor.extract(row.profile.resume))))
    const authorize = async () => { for (const row of selected) await candidate(actor, driveId, row.studentId); return true }
    const context = { kind: 'match', evidence: [], userQuestion, candidates, drive: companyContext(buildSafeContext({ drive: selected[0].drive }, { kind: 'match' }).context, selected[0].drive, selected[0].company, { status: 'not_applicable' }).drive, company: companyContext({ evidence: [] }, selected[0].drive, selected[0].company, { status: 'not_applicable' }).company }
    const provider = await ai.analyze({ actor, scope: `company:${driveId}:group`, kind: 'match', authorize, loadContext: async () => ({}), enrichContext: () => context, contract: groupQuestionContract(selected.map(row => row.studentId)) })
    await authorize()
    return { ai: provider, candidates: selected.map(row => ({ studentId: row.studentId, name: row.name, objectiveMatch: row.objective.score })), retrieval: 'structured profile + cached resume evidence; selected resume excerpts only' }
  }
  const publicJob = job => ({ id: job.id, driveId: job.driveId, status: job.status, total: job.studentIds.length, completed: job.items.filter(row => ['done', 'failed'].includes(row.status)).length, items: structuredClone(job.items), limits: companyLimits(config) })
  async function drain() {
    if (draining) return
    draining = true
    try {
      while (queue.length) {
        const job = queue.shift(); job.status = 'running'
        for (const item of job.items) {
          item.status = 'running'
          try {
            const deadline = now() + config.AI_TIMEOUT_MS + 30000
            while (ai.availability && (ai.availability().active >= config.AI_MAX_CONCURRENT || ai.availability().cooldownMs > 0) && now() < deadline) await delay(1000)
            const data = await analyze(job.actor, job.driveId, item.studentId, false)
            item.status = data.ai.status === 'unavailable' ? 'failed' : 'done'; item.reason = data.ai.reason; item.result = data
          } catch { item.status = 'failed'; item.reason = 'unavailable' }
        }
        job.status = 'completed'
      }
    } finally { draining = false }
  }
  async function startBatch(actor, driveId, studentIds) {
    if (!studentIds.length || studentIds.length > companyLimits(config).batch || new Set(studentIds).size !== studentIds.length) throw invalid(`Select 1–${companyLimits(config).batch} unique candidates.`)
    const rows = []
    for (const id of studentIds) rows.push(await candidate(actor, driveId, id))
    for (const [id, job] of jobs) if (job.expires <= now() && job.status === 'completed') jobs.delete(id)
    const signature = fingerprint({ owner: String(actor._id), driveId, revisions: rows.map(row => `${row.studentId}:${row.revision}`).sort() })
    const duplicate = [...jobs.values()].find(job => job.signature === signature && job.items.every(item => item.status !== 'failed'))
    if (duplicate) return publicJob(duplicate)
    if ([...jobs.values()].filter(job => job.status !== 'completed').length >= 10) throw new AppError('AI batch queue is busy.', { statusCode: 429, errorCode: 'RATE_LIMITED' })
    if (jobs.size >= 20) { const old = [...jobs.values()].find(job => job.status === 'completed'); if (old) jobs.delete(old.id) }
    const job = { id: randomUUID(), actor: { _id: actor._id, role: actor.role }, driveId, studentIds, signature, status: 'queued', expires: now() + 3600000, items: studentIds.map(studentId => ({ studentId, status: 'queued' })) }
    jobs.set(job.id, job); queue.push(job); void drain(); return publicJob(job)
  }
  async function pollBatch(actor, driveId, jobId) {
    await owned(actor, driveId)
    const job = jobs.get(jobId)
    if (!job || String(job.actor._id) !== String(actor._id) || job.driveId !== driveId) throw denied()
    for (const id of job.studentIds) await candidate(actor, driveId, id)
    const view = publicJob(job)
    for (const item of view.items) if (item.result) item.result = await read(actor, driveId, item.studentId)
    return view
  }
  return { read, analyze, ask, groupAsk, startBatch, pollBatch, limits: () => companyLimits(config) }
}
