import { z } from 'zod'

const requiredText = (label, max) => z.string().trim().min(2, `${label} is required.`).max(max)
const optionalText = (max) => z.string().trim().max(max).optional().transform((value) => value || undefined)
const optionalUrl = z.string().trim().url('Enter a valid URL.').max(500).or(z.literal('')).optional().transform((value) => value || undefined)
const internshipSchema = z.object({
  organization: requiredText('Organization', 160), role: requiredText('Role', 120),
  employmentType: z.enum(['internship', 'part_time', 'full_time', 'research', 'freelance']),
  startDate: z.coerce.date(), endDate: z.coerce.date().optional(), description: requiredText('Experience description', 1500),
  skills: z.array(z.string().trim().min(1).max(60)).max(20), url: optionalUrl,
}).refine((item) => !item.endDate || item.endDate >= item.startDate, { message: 'Experience end date cannot be before its start date.', path: ['endDate'] })
const certificationSchema = z.object({ title: requiredText('Certification title', 160), issuer: requiredText('Certification issuer', 160), issuedOn: z.coerce.date().optional(), credentialUrl: optionalUrl })
const achievementSchema = z.object({ title: requiredText('Achievement title', 160), issuer: requiredText('Achievement issuer', 160), awardedOn: z.coerce.date().optional(), description: optionalText(1000) })
const activitySchema = z.object({ title: requiredText('Activity title', 160), organization: requiredText('Organization', 160), role: optionalText(120), description: optionalText(1000) })

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
  professionalHeadline: z.string().trim().max(160).optional(),
  about: z.string().trim().max(2000).optional(),
  softSkills: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  targetRole: optionalText(120),
  careerInterests: z.array(z.string().trim().min(1).max(100)).max(10),
  internships: z.array(internshipSchema).max(5),
  certifications: z.array(certificationSchema).max(10),
  achievements: z.array(achievementSchema).max(10),
  extracurriculars: z.array(activitySchema).max(10),
  leadership: z.array(activitySchema).max(10),
})
