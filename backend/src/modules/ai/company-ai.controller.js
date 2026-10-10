import { sendSuccess } from '../../utils/api-response.js'
import { createCompanyIntelligence } from './company-ai.service.js'
export function createCompanyAiControllers(config, dependencies) {
  const service = createCompanyIntelligence(config, dependencies)
  const send = (response, data) => sendSuccess(response, { message: 'Advisory candidate intelligence.', data })
  return {
    limits: async (request, response) => send(response, service.limits()),
    read: async (request, response) => send(response, await service.read(request.user, request.params.driveId, request.params.studentId)),
    analyze: async (request, response) => send(response, await service.analyze(request.user, request.params.driveId, request.params.studentId)),
    ask: async (request, response) => send(response, await service.ask(request.user, request.params.driveId, request.params.studentId, request.body.question)),
    group: async (request, response) => send(response, await service.groupAsk(request.user, request.params.driveId, request.body.question)),
    batch: async (request, response) => send(response, await service.startBatch(request.user, request.params.driveId, request.body.studentIds)),
    poll: async (request, response) => send(response, await service.pollBatch(request.user, request.params.driveId, request.params.jobId)),
    overview: async (request, response) => {
      const records = []
      for (const row of request.body.candidates) records.push(await service.read(request.user, row.driveId, row.studentId))
      return send(response, { records, limits: service.limits() })
    },
  }
}
