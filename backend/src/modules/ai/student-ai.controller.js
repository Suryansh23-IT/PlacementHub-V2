import { sendSuccess } from '../../utils/api-response.js'
import { createStudentIntelligence } from './student-ai.service.js'

export function createStudentAiControllers(config) {
  let service
  const getService = () => service ??= createStudentIntelligence(config)
  return {
    assessCareer: async (request, response) => sendSuccess(response, { message: 'Career quality assessment.', data: await getService().assessCareer(request.user) }),
    assessMatch: async (request, response) => sendSuccess(response, { message: 'Drive quality assessment.', data: await getService().assessMatch(request.user, request.params.driveId) }),
    askCareer: async (request, response) => sendSuccess(response, { message: 'Contextual career answer.', data: await getService().askCareer(request.user, request.body.question) }),
    askMatch: async (request, response) => sendSuccess(response, { message: 'Contextual drive preparation answer.', data: await getService().askMatch(request.user, request.params.driveId, request.body.question) }),
    career: async (request, response) => sendSuccess(response, { message: 'Student career readiness.', data: await getService().career(request.user, { explain: request.method === 'POST' }) }),
    match: async (request, response) => sendSuccess(response, { message: 'Student professional drive match.', data: await getService().match(request.user, request.params.driveId, { explain: request.method === 'POST' }) }),
  }
}
