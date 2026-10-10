import { User } from '../auth/auth.model.js'
import { StudentProfile } from '../students/student.model.js'
import { PlacementDrive } from '../placement-drives/placement-drive.model.js'
import { Company } from '../companies/company.model.js'
import { AppError } from '../../errors/app-error.js'
import { assertAiRuntime } from './ai.guard.js'
import { buildSafeContext, fingerprint } from './ai.context.js'
import { createAiService } from './ai.service.js'
import { providerIdentity } from './providers/ai.provider.js'
import { calculateProfileStrength, calculateDriveMatch } from './student-ai.scoring.js'
import { careerContract, matchContract } from './student-ai.schemas.js'
import { STUDENT_SCORING_VERSION } from '../../config/ai-scoring.js'
import { createQuestionContract, safeQuestion } from './ai-question.js'
import { qualityContext, qualityContract, assessmentScore, ASSESSMENT_VERSION } from './student-ai.assessment.js'
import { createResumeTextService, resumeRevision, RESUME_TEXT_VERSION } from './resume-text.service.js'
import { enrichStudentContext } from './student-ai.context.js'

export const PROFESSIONAL_FIELDS = 'skills skillGroups projects internships certifications achievements targetRole careerInterests professionalHeadline about professionalLinks codingProfiles resume'
const visibleDrive = id => ({ _id: id, proposalStatus: 'approved', lifecycleStatus: 'published' })
export function createStudentIntelligence(config, { profileModel = StudentProfile, userModel = User, driveModel = PlacementDrive, companyModel = Company, aiService, aiDependencies, resumeTextService, now = Date.now } = {}) {
  assertAiRuntime(config)
  let intelligence = aiService; let extractor = resumeTextService
  // Latest successful assessment only, bounded runtime-local memory. No questions
  // or raw contexts are retained. Restart/24h expiry returns Not analyzed yet.
  const latest = new Map()
  const authorized = async actor => {
    if (actor?.role !== 'student') return false
    const current = await userModel.findById(actor._id).select('_id role isActive').lean()
    return current?.role === 'student' && current.isActive === true
  }
  async function run(actor, driveId, explain = false, question, assess = false) {
    assertAiRuntime(config)
    if (!await authorized(actor)) throw new AppError('Student access is required.', { statusCode: 403, errorCode: 'FORBIDDEN' })
    const profile = await profileModel.findOne({ userId: actor._id }).select(PROFESSIONAL_FIELDS).lean() ?? {}
    const drive = driveId ? await driveModel.findOne(visibleDrive(driveId)).select('role companyId driveDetails eligibility phases').lean() : undefined
    if (driveId && !drive) throw new AppError('Placement Drive was not found.', { statusCode: 404, errorCode: 'NOT_FOUND' })
    const company = drive?.companyId ? await companyModel.findById(drive.companyId).select('companyName industry description roleDomains technologies productsServices').lean() : undefined
    const kind = driveId ? 'match' : 'professional'
    const { context } = buildSafeContext({ profile, drive }, { kind })
    const deterministic = driveId ? calculateDriveMatch(context) : calculateProfileStrength(context)
    const scope = driveId ? `student-drive:${driveId}` : 'student-career'
    const ownerKey = fingerprint({ actor: String(actor._id), scope })
    const professional = buildSafeContext({ profile }).context
    const richBase = safe => ({ ...professional, ...safe, evidence: professional.evidence })
    const currentFingerprint = fingerprint({ context: enrichStudentContext(richBase(context), drive, company, { status: 'revision_only' }), resumeRevision: resumeRevision(profile.resume), resumeVersion: RESUME_TEXT_VERSION, assessmentVersion: ASSESSMENT_VERSION, provider: providerIdentity(config) })
    let previous = latest.get(ownerKey)
    if (previous && previous.expires <= now()) { latest.delete(ownerKey); previous = undefined }
    let ai = { status: 'not_requested' }
    let resume = { status: previous?.resumeStatus ?? (profile.resume ? 'not_analyzed' : 'not_uploaded'), text: '' }
    const userQuestion = question === undefined ? undefined : safeQuestion(question)
    const authorize = async () => await authorized(actor) && (!driveId || Boolean(await driveModel.findOne(visibleDrive(driveId)).select('_id').lean()))
    if (explain && (assess || deterministic.score !== null || userQuestion !== undefined)) {
      extractor ??= createResumeTextService(config)
      resume = await extractor.extract(profile.resume)
      intelligence ??= createAiService(config, aiDependencies)
      ai = await intelligence.analyze({ actor, scope: `${scope}${assess ? ':assessment' : userQuestion === undefined ? ':explanation' : ':ask'}`, kind,
        scoringVersion: assess ? ASSESSMENT_VERSION : STUDENT_SCORING_VERSION, authorize, loadContext: async () => ({ profile, drive }),
        enrichContext: safe => {
          const rich = enrichStudentContext(richBase(safe), drive, company, resume)
          const facts = { score: deterministic.score, label: deterministic.label, matchedSkills: deterministic.matchedSkills, missingSkills: deterministic.missingSkills, suitableRoles: deterministic.suitableRoles }
          return assess ? qualityContext(rich, deterministic) : { ...rich, deterministic: userQuestion === undefined ? deterministic : facts, ...(userQuestion === undefined ? {} : { userQuestion }) }
        },
        contract: assess ? qualityContract(Boolean(driveId)) : userQuestion === undefined ? (driveId ? matchContract : careerContract) : createQuestionContract(driveId ? 'preparation for this role' : 'professional career preparation'),
        resumeDependent: true, forceRefresh: assess,
      })
      if (assess && ai.status === 'available') {
        previous = { ...assessmentScore(ai.analysis, Boolean(driveId)), analyzedAt: new Date(now()).toISOString(), fingerprint: currentFingerprint, resumeStatus: resume.status, expires: now() + 86400000 }
        if (latest.size >= (config.AI_CACHE_MAX_ENTRIES ?? 100) && !latest.has(ownerKey)) latest.delete(latest.keys().next().value)
        latest.set(ownerKey, previous)
      }
    }
    if (!await authorize()) throw new AppError('Student access is required.', { statusCode: 403, errorCode: 'FORBIDDEN' })
    if (userQuestion !== undefined) return { ai }
    const assessment = previous ? { score: previous.score, sections: previous.sections, summary: previous.summary, analyzedAt: previous.analyzedAt, stale: previous.fingerprint !== currentFingerprint, resumeStatus: previous.resumeStatus } : null
    return { deterministic, ai, assessment, resumeStatus: resume.status, basis: 'Objective score and independent AI opinion. Eligibility and Apply remain separate. PDF layout/ATS formatting is not assessed.' }
  }
  return { career: (actor, { explain = false } = {}) => run(actor, null, explain), match: (actor, driveId, { explain = false } = {}) => run(actor, driveId, explain), assessCareer: actor => run(actor, null, true, undefined, true), assessMatch: (actor, driveId) => run(actor, driveId, true, undefined, true), askCareer: (actor, question) => run(actor, null, true, question), askMatch: (actor, driveId, question) => run(actor, driveId, true, question) }
}
