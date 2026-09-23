import { z } from 'zod'
export { placementPolicySchema as recruiterPolicySchema } from '../placement-policy/policy.validation.js'
export const recruiterAcceptanceSchema = z.object({
  policyId: z.string().regex(/^[a-f\d]{24}$/i),
  policyVersion: z.string().trim().min(1).max(40),
  agreed: z.literal(true),
})
