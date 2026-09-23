import { Router } from 'express'
import { validateBody } from '../../middleware/validate-request.js'
import { authenticate, authorizeRoles } from '../auth/auth.middleware.js'
import { USER_ROLES } from '../auth/auth.constants.js'
import { acceptMyStudentPolicy, getAdminStudentPolicy, getMyStudentPolicy, putAdminStudentPolicy } from './student-policy.controller.js'
import { studentPolicySchema } from './student-policy.validation.js'

export const studentPolicyRouter = Router()
studentPolicyRouter.use(authenticate, authorizeRoles(USER_ROLES.STUDENT))
studentPolicyRouter.get('/me/policy', getMyStudentPolicy)
studentPolicyRouter.post('/me/policy/accept', acceptMyStudentPolicy)
export const adminStudentPolicyRouter = Router()
adminStudentPolicyRouter.use(authenticate, authorizeRoles(USER_ROLES.PLACEMENT_ADMIN))
adminStudentPolicyRouter.get('/', getAdminStudentPolicy)
adminStudentPolicyRouter.put('/', validateBody(studentPolicySchema), putAdminStudentPolicy)
