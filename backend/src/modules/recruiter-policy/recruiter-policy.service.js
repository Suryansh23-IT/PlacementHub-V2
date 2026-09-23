import { AppError } from '../../errors/app-error.js'
import { Company } from '../companies/company.model.js'
import { RecruiterPlacementPolicy, RecruiterPolicyAcceptance } from './recruiter-policy.model.js'

const conflict = message => new AppError(message, { statusCode: 409, errorCode: 'CONFLICT' })
const missing = message => new AppError(message, { statusCode: 404, errorCode: 'NOT_FOUND' })

export async function listRecruiterPolicies({ policyModel = RecruiterPlacementPolicy } = {}) {
  return policyModel.find({}).sort({ createdAt: -1 })
}

export async function saveRecruiterPolicy(input, { policyModel = RecruiterPlacementPolicy } = {}) {
  const { id, ...values } = input
  let policy = id ? await policyModel.findById(id) : null
  if (id && !policy) throw missing('Recruiter policy was not found.')
  // Existing versions retain their signed text. Changes require a new version.
  if (policy && ['title', 'academicYear', 'version', 'policyText'].some(key => policy[key] !== values[key])) {
    throw conflict('Existing policy versions cannot be edited. Create a new version for revised text.')
  }
  if (!policy && await policyModel.findOne({ academicYear: values.academicYear, version: values.version })) {
    throw conflict('This academic year and policy version already exist.')
  }
  try {
    // Create inactive first so invalid input cannot deactivate the current policy.
    if (!policy) policy = await policyModel.create({ ...values, active: false })
    if (values.active) await policyModel.updateMany({ active: true, _id: { $ne: policy._id } }, { $set: { active: false } })
    return await policyModel.findByIdAndUpdate(policy._id, { $set: { active: values.active } }, { new: true, runValidators: true })
  } catch (error) {
    if (error?.code === 11000) throw conflict('A policy version or activation changed concurrently. Reload policies and try again.')
    throw error
  }
}

export async function getRecruiterPolicyStatus(companyId, { policyModel = RecruiterPlacementPolicy, acceptanceModel = RecruiterPolicyAcceptance } = {}) {
  const policy = await policyModel.findOne({ active: true })
  const acceptance = policy ? await acceptanceModel.findOne({ companyId, policyId: policy._id, policyVersion: policy.version }) : null
  return { policy, acceptance }
}

export async function getRecruiterAgreementSummary(companyId, dependencies = {}) {
  const { policy, acceptance } = await getRecruiterPolicyStatus(companyId, dependencies)
  return { status: acceptance ? 'accepted' : 'not_accepted', title: policy?.title ?? null, academicYear: policy?.academicYear ?? null, version: policy?.version ?? null, acceptedAt: acceptance?.acceptedAt ?? null }
}

export async function requireApprovedCompany(companyId, { companyModel = Company } = {}) {
  const company = await companyModel.findOne({ userId: companyId }).select('approvalStatus')
  if (company?.approvalStatus !== 'approved') throw new AppError('Only approved companies can access and accept the Recruiter Placement Policy.', { statusCode: 403, errorCode: 'FORBIDDEN' })
}

export async function acceptRecruiterPolicy(companyId, input, { companyModel = Company, policyModel = RecruiterPlacementPolicy, acceptanceModel = RecruiterPolicyAcceptance } = {}) {
  await requireApprovedCompany(companyId, { companyModel })
  const { policy, acceptance } = await getRecruiterPolicyStatus(companyId, { policyModel, acceptanceModel })
  if (!policy) throw missing('No active Recruiter Placement Policy is available.')
  if (!input.agreed || String(policy._id) !== input.policyId || policy.version !== input.policyVersion) {
    throw conflict('The active policy has changed. Reload, read it, and confirm your agreement again.')
  }
  if (acceptance) throw conflict('This Recruiter Placement Policy version has already been accepted.')
  try {
    return { policy, acceptance: await acceptanceModel.create({ companyId, policyId: policy._id, policyVersion: policy.version, acceptedAt: new Date() }) }
  } catch (error) {
    if (error?.code === 11000) throw conflict('This Recruiter Placement Policy version has already been accepted.')
    throw error
  }
}
