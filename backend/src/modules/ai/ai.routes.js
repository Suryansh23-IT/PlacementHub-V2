import { createAiRuntimeControllers } from './ai-runtime.controller.js'
import { Router } from 'express'
import { authenticate, authorizeRoles } from '../auth/auth.middleware.js'
import { validateQuery, validateBody, validateParams } from '../../middleware/validate-request.js'
import { assertAiRuntime } from './ai.guard.js'
import { createAiRateLimiter } from './ai-rate-limit.js'
import { createAiStatusController } from './ai.controller.js'
import { aiStatusQuerySchema, aiEmptyBodySchema, studentAiDriveParamsSchema } from './ai.validation.js'
import { createStudentAiControllers } from './student-ai.controller.js'
import { contextualQuestionSchema } from './ai-question.js'
import { createCompanyAiControllers } from './company-ai.controller.js'
import { companyAiParams, companyBatchBody, companyOverviewBody } from './company-ai.validation.js'
import { createAiService } from './ai.service.js'
import { createResumeTextService } from './resume-text.service.js'
import { createAdminAiControllers } from './admin-ai.controller.js'

export function createAiRouter(config) {
  assertAiRuntime(config)
  const router = Router()
  router.use(authenticate, authorizeRoles('student', 'company', 'placement_admin'))
  router.use((request, response, next) => { assertAiRuntime(config); next() })
  const dependencies = { aiService: createAiService(config), resumeTextService: createResumeTextService(config) }
  const recovery = createAiRuntimeControllers(dependencies.aiService, config)
  const recoveryReadLimit = createAiRateLimiter({ ...config, AI_RATE_LIMIT_WINDOW_MS: 60000, AI_RATE_LIMIT_MAX: 30 })
  const recoveryResetLimit = createAiRateLimiter({ ...config, AI_RATE_LIMIT_WINDOW_MS: 60000, AI_RATE_LIMIT_MAX: 3 })
  router.get('/admin/runtime', authorizeRoles('placement_admin'), recoveryReadLimit, validateQuery(aiStatusQuerySchema), recovery.status)
  router.post('/admin/runtime/reset', authorizeRoles('placement_admin'), recoveryResetLimit, validateBody(aiEmptyBodySchema), recovery.reset)
  const generationLimiter = createAiRateLimiter(config)
  const pollingLimiter = createAiRateLimiter({ ...config, AI_RATE_LIMIT_MAX: 30 })
  router.use((request, response, next) => request.method === 'GET' && /^\/companies\/drives\/[^/]+\/batches\//.test(request.path) ? pollingLimiter(request, response, next) : generationLimiter(request, response, next))
  // Only Ask endpoints accept a bounded question; never client profiles/scores/rules.
  router.get('/status', validateQuery(aiStatusQuerySchema), createAiStatusController(config))

  const student = createStudentAiControllers(config, dependencies)
  const company = createCompanyAiControllers(config, dependencies)
  const admin = createAdminAiControllers(config, dependencies)
  router.use('/admin', authorizeRoles('placement_admin'))
  router.get('/admin/insights', validateQuery(aiStatusQuerySchema), admin.read)
  router.post('/admin/insights', validateBody(aiEmptyBodySchema), admin.generate)
  router.post('/admin/ask', validateBody(contextualQuestionSchema), admin.ask)
  router.use('/companies', authorizeRoles('company'))
  router.get('/companies/limits', company.limits)
  router.post('/companies/overview', validateBody(companyOverviewBody), company.overview)
  const companyDrive = '/companies/drives/:driveId'
  router.post(`${companyDrive}/group/ask`, validateParams(companyAiParams), validateBody(contextualQuestionSchema), company.group)
  router.post(`${companyDrive}/batches`, validateParams(companyAiParams), validateBody(companyBatchBody), company.batch)
  router.get(`${companyDrive}/batches/:jobId`, validateParams(companyAiParams), company.poll)
  router.get(`${companyDrive}/candidates/:studentId`, validateParams(companyAiParams), company.read)
  router.post(`${companyDrive}/candidates/:studentId/assessment`, validateParams(companyAiParams), validateBody(aiEmptyBodySchema), company.analyze)
  router.post(`${companyDrive}/candidates/:studentId/ask`, validateParams(companyAiParams), validateBody(contextualQuestionSchema), company.ask)
  router.use('/students', authorizeRoles('student'))
  router.get('/students/me/career', validateQuery(aiStatusQuerySchema), student.career)
  router.post('/students/me/career/assessment', validateQuery(aiStatusQuerySchema), validateBody(aiEmptyBodySchema), student.assessCareer)
  router.post('/students/me/career/explanation', validateQuery(aiStatusQuerySchema), validateBody(aiEmptyBodySchema), student.career)
  router.post('/students/me/career/ask', validateQuery(aiStatusQuerySchema), validateBody(contextualQuestionSchema), student.askCareer)
  router.get('/students/me/drives/:driveId/match', validateParams(studentAiDriveParamsSchema), validateQuery(aiStatusQuerySchema), student.match)
  router.post('/students/me/drives/:driveId/match/assessment', validateParams(studentAiDriveParamsSchema), validateQuery(aiStatusQuerySchema), validateBody(aiEmptyBodySchema), student.assessMatch)
  router.post('/students/me/drives/:driveId/match/explanation', validateParams(studentAiDriveParamsSchema), validateQuery(aiStatusQuerySchema), validateBody(aiEmptyBodySchema), student.match)
  router.post('/students/me/drives/:driveId/match/ask', validateParams(studentAiDriveParamsSchema), validateQuery(aiStatusQuerySchema), validateBody(contextualQuestionSchema), student.askMatch)
  return router
}
