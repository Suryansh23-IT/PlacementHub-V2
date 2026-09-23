import { Router } from 'express'
import { validateBody } from '../../middleware/validate-request.js'
import { authenticate, authorizeRoles } from '../auth/auth.middleware.js'
import { USER_ROLES } from '../auth/auth.constants.js'
import { getInstitution, patchInstitution } from './institution.controller.js'
import { institutionSchema } from './institution.validation.js'
export const institutionRouter = Router(); institutionRouter.use(authenticate, authorizeRoles(USER_ROLES.PLACEMENT_ADMIN)); institutionRouter.get('/', getInstitution); institutionRouter.patch('/', validateBody(institutionSchema), patchInstitution)
