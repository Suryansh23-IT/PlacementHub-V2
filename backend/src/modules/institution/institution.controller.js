import { sendSuccess } from '../../utils/api-response.js'
import { getInstitutionProfile, updateInstitutionProfile } from './institution.service.js'
export async function getInstitution(request, response) { return sendSuccess(response, { message: 'Institution profile retrieved successfully.', data: await getInstitutionProfile() }) }
export async function patchInstitution(request, response) { return sendSuccess(response, { message: 'Institution profile updated successfully.', data: await updateInstitutionProfile(request.body) }) }
