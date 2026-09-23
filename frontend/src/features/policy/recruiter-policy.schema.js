import { z } from 'zod'

export const recruiterPolicySchema = z.object({
  title: z.string().trim().min(2, 'Enter a policy title.').max(200),
  academicYear: z.string().trim().min(4, 'Enter an academic year.').max(30),
  version: z.string().trim().min(1, 'Enter a version.').max(40),
  policyText: z.string().trim().min(20, 'Insert the approved Recruiter Placement Policy text (at least 20 characters).').max(30000),
  active: z.boolean(),
})
