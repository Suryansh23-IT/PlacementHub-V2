import { AppError } from '../../errors/app-error.js'
import { Application } from './application.model.js'
import { WITHDRAWABLE_APPLICATION_STATUSES } from './application.constants.js'

const notFound = () => new AppError('Application was not found.', { statusCode: 404, errorCode: 'NOT_FOUND' })
const conflict = () => new AppError('This application is no longer active and cannot be withdrawn.', { statusCode: 409, errorCode: 'CONFLICT' })

function assign(document, values) { if (typeof document.set === 'function') document.set(values); else Object.assign(document, values) }

export async function withdrawStudentApplication(studentId, applicationId, {
  applicationModel = Application,
  now = new Date(),
} = {}) {
  const application = await applicationModel.findOne({ _id: applicationId, studentId })
  if (!application) throw notFound()
  if (!WITHDRAWABLE_APPLICATION_STATUSES.includes(application.currentStatus)) throw conflict()
  const withdrawnAt = new Date(now)
  assign(application, {
    currentStatus: 'withdrawn',
    withdrawnAt,
    phaseHistory: [...(application.phaseHistory ?? []), { phase: application.currentPhase, status: 'withdrawn', event: 'withdrawn', occurredAt: withdrawnAt, actorId: studentId }],
  })
  const saved = await application.save()
  return { application: saved }
}
