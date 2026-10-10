import { Router } from 'express'
import { authenticate, authorizeRoles } from '../auth/auth.middleware.js'
import { validateQuery, validateBody, validateParams } from '../../middleware/validate-request.js'
import { assertAiRuntime } from './ai.guard.js'
import { createAiRateLimiter } from './ai-rate-limit.js'
import { createAiStatusController } from './ai.controller.js'
import { aiStatusQuerySchema, aiEmptyBodySchema, studentAiDriveParamsSchema } from './ai.validation.js'
import { createStudentAiControllers } from './student-ai.controller.js'
import { contextualQuestionSchema } from './ai-question.js'

export function createAiRouter(config) {
  assertAiRuntime(config)
  const router = Router()
  router.use(authenticate, authorizeRoles('student', 'company', 'placement_admin'))
  router.use((request, response, next) => { assertAiRuntime(config); next() })
  router.use(createAiRateLimiter(config))
  // Only Ask endpoints accept a bounded question; never client profiles/scores/rules.
  router.get('/status', validateQuery(aiStatusQuerySchema), createAiStatusController(config))
  const student = createStudentAiControllers(config)
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
