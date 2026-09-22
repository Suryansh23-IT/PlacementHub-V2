import { z } from 'zod'

const requiredText = (label, max) => z.string().trim().min(2, `${label} is required.`).max(max)

export const studentProfileFormSchema = z.object({
  branch: requiredText('Branch', 100),
  graduationYear: z.coerce.number().int().min(2000, 'Enter a valid graduation year.').max(2100, 'Enter a valid graduation year.'),
  cgpa: z.coerce.number().min(0, 'CGPA cannot be below 0.').max(10, 'CGPA cannot exceed 10.'),
  activeBacklogs: z.coerce.number().int().min(0, 'Backlogs cannot be negative.').max(100),
  skills: z.array(z.string().trim().min(1).max(60)).max(30),
  projects: z.array(z.object({
    title: requiredText('Project title', 120),
    description: requiredText('Project description', 1000),
    technologies: z.array(z.string().trim().min(1).max(60)).max(20),
    url: z.string().trim().url('Project URL must be valid.').or(z.literal('')).optional().transform((value) => value || undefined),
  })).max(10),
})
