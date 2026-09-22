import { z } from 'zod'

const trimmedText = (min, max, label) => z.string().trim().min(min, `${label} is required.`).max(max)

const projectSchema = z.object({
  title: trimmedText(2, 120, 'Project title'),
  description: trimmedText(2, 1000, 'Project description'),
  technologies: z.array(trimmedText(1, 60, 'Technology')).max(20).default([]),
  url: z.string().trim().url('Project URL must be a valid URL.').max(500).or(z.literal('')).optional().transform((value) => value || undefined),
})

export const studentProfileSchema = z.object({
  branch: trimmedText(2, 100, 'Branch'),
  graduationYear: z.coerce.number().int().min(2000).max(2100),
  cgpa: z.coerce.number().min(0).max(10),
  activeBacklogs: z.coerce.number().int().min(0).max(100),
  skills: z.array(trimmedText(1, 60, 'Skill')).max(30).default([]),
  projects: z.array(projectSchema).max(10).default([]),
})

export const verificationSchema = z.object({
  status: z.enum(['verified', 'rejected']),
  rejectionReason: z.string().trim().min(2, 'Provide a short reason when rejecting a student.').max(500).optional(),
}).superRefine((value, context) => {
  if (value.status === 'rejected' && !value.rejectionReason) {
    context.addIssue({ code: 'custom', path: ['rejectionReason'], message: 'Provide a short reason when rejecting a student.' })
  }
  if (value.status === 'verified' && value.rejectionReason) {
    context.addIssue({ code: 'custom', path: ['rejectionReason'], message: 'A rejection reason is only allowed when rejecting a student.' })
  }
})
