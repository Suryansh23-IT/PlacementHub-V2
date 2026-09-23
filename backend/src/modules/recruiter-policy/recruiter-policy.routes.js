import { Router } from 'express'
import { authenticate, authorizeRoles } from '../auth/auth.middleware.js'
import { USER_ROLES } from '../auth/auth.constants.js'
import { validateBody, validateParams } from '../../middleware/validate-request.js'
import { companyIdParamsSchema } from '../companies/company.validation.js'
import { recruiterAcceptanceSchema, recruiterPolicySchema } from './recruiter-policy.validation.js'
import { acceptMyRecruiterPolicy, getAdminRecruiterAgreement, getAdminRecruiterPolicies, getMyRecruiterPolicy, putAdminRecruiterPolicy } from './recruiter-policy.controller.js'

export const recruiterPolicyRouter = Router()
recruiterPolicyRouter.use(authenticate, authorizeRoles(USER_ROLES.COMPANY))
recruiterPolicyRouter.get('/me/policy', getMyRecruiterPolicy)
recruiterPolicyRouter.post('/me/policy/accept', validateBody(recruiterAcceptanceSchema), acceptMyRecruiterPolicy)
export const adminRecruiterPolicyRouter = Router()
adminRecruiterPolicyRouter.use(authenticate, authorizeRoles(USER_ROLES.PLACEMENT_ADMIN))
adminRecruiterPolicyRouter.get('/', getAdminRecruiterPolicies)
adminRecruiterPolicyRouter.put('/', validateBody(recruiterPolicySchema), putAdminRecruiterPolicy)
adminRecruiterPolicyRouter.get('/companies/:id', validateParams(companyIdParamsSchema), getAdminRecruiterAgreement)
