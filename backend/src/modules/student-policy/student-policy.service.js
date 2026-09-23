import { AppError } from '../../errors/app-error.js'
import { StudentProfile } from '../students/student.model.js'
import { StudentPlacementPolicy, StudentPolicyAcceptance } from './student-policy.model.js'
import { defaultStudentPolicy } from './default-student-policy.js'

export async function getActivePolicy({ policyModel = StudentPlacementPolicy } = {}) {
  let policy = await policyModel.findOne({ active: true })
  if (!policy) policy = await policyModel.create(defaultStudentPolicy)
  return policy
}

export async function saveStudentPolicy(input, { policyModel = StudentPlacementPolicy } = {}) {
  if (input.active) await policyModel.updateMany({ active: true, ...(input.id ? { _id: { $ne: input.id } } : {}) }, { $set: { active: false } })
  if (input.id) {
    const policy = await policyModel.findByIdAndUpdate(input.id, { $set: withoutId(input) }, { new: true, runValidators: true })
    if (!policy) throw new AppError('Student placement policy was not found.', { statusCode: 404, errorCode: 'NOT_FOUND' })
    return policy
  }
  return policyModel.create(withoutId(input))
}

export async function getStudentPolicyStatus(studentId, { policyModel = StudentPlacementPolicy, acceptanceModel = StudentPolicyAcceptance } = {}) {
  const policy = await getActivePolicy({ policyModel })
  const acceptance = await acceptanceModel.findOne({ studentId, policyId: policy._id })
  return { policy, acceptance }
}

export async function getStudentPolicyAgreementSummary(studentId, dependencies = {}) {
  const { policy, acceptance } = await getStudentPolicyStatus(studentId, dependencies)
  return { status: acceptance ? 'accepted' : 'not_accepted', title: policy.title, academicYear: policy.academicYear, version: policy.version, acceptedAt: acceptance?.acceptedAt }
}

export async function acceptActiveStudentPolicy(studentId, { profileModel = StudentProfile, policyModel = StudentPlacementPolicy, acceptanceModel = StudentPolicyAcceptance } = {}) {
  const profile = await profileModel.findOne({ userId: studentId }).select('verificationStatus')
  if (profile?.verificationStatus !== 'verified') throw new AppError('Only verified students can accept the Student Placement Policy.', { statusCode: 403, errorCode: 'FORBIDDEN' })
  const policy = await getActivePolicy({ policyModel })
  const existing = await acceptanceModel.findOne({ studentId, policyId: policy._id })
  if (existing) throw new AppError('This Student Placement Policy version has already been accepted.', { statusCode: 409, errorCode: 'CONFLICT' })
  try { return { policy, acceptance: await acceptanceModel.create({ studentId, policyId: policy._id, policyVersion: policy.version, acceptedAt: new Date() }) } } catch (error) {
    if (error?.code === 11000) throw new AppError('This Student Placement Policy version has already been accepted.', { statusCode: 409, errorCode: 'CONFLICT' })
    throw error
  }
}

function withoutId({ id, ...input }) { return input }
