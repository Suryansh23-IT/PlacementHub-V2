import { z } from 'zod'

const trimmedText = (min, max, label) => z.string().trim().min(min, `${label} is required.`).max(max)

const projectSchema = z.object({
  title: trimmedText(2, 120, 'Project title'),
  description: trimmedText(2, 1000, 'Project description'),
  technologies: z.array(trimmedText(1, 60, 'Technology')).max(20).default([]),
  url: z.string().trim().url('Project URL must be a valid URL.').max(500).or(z.literal('')).optional().transform((value) => value || undefined),
})
const academicSchema = z.object({ board: trimmedText(2, 120, 'Board'), schoolName: trimmedText(2, 200, 'School name'), passingYear: z.coerce.number().int().min(1990).max(2100), score: z.coerce.number().min(0).max(100) })
const skillGroupSchema = z.object({ name: trimmedText(2, 80, 'Skill group name'), skills: z.array(trimmedText(1, 60, 'Skill')).min(1).max(20) })
const semesterSpiSchema = z.object({ semester: z.coerce.number().int().min(1).max(8), spi: z.coerce.number().min(0).max(10) })
const optionalUrl = z.string().trim().url('Enter a valid URL.').max(500).or(z.literal('')).optional().transform((value) => value || undefined)
const codingProfileSchema = z.object({ platform: trimmedText(2, 80, 'Platform name'), url: z.string().trim().url('Coding profile URL must be a valid URL.').max(500) })

export const studentProfileSchema = z.object({
  branch: trimmedText(2, 100, 'Branch'),
  graduationYear: z.coerce.number().int().min(2000).max(2100),
  cgpa: z.coerce.number().min(0).max(10),
  activeBacklogs: z.coerce.number().int().min(0).max(100),
  phone: trimmedText(6, 30, 'Phone number'), rollNumber: trimmedText(2, 60, 'Roll/enrollment number'),
  class10: academicSchema, class12: academicSchema,
  semesterSpis: z.array(semesterSpiSchema).min(1).max(8).refine((items) => new Set(items.map((item) => item.semester)).size === items.length, 'Each semester can appear only once.'),
  skillGroups: z.array(skillGroupSchema).min(1).max(3),
  skills: z.array(trimmedText(1, 60, 'Skill')).max(30).default([]),
  projects: z.array(projectSchema).min(1).max(3),
  professionalLinks: z.object({ linkedin: optionalUrl, github: optionalUrl, portfolio: optionalUrl }).default({}),
  codingProfiles: z.array(codingProfileSchema).max(5).default([]),
})
export const studentIdParamsSchema = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i, 'Student ID must be valid.') })
export const documentTypeParamsSchema = z.object({ type: z.enum(['class10', 'class12', 'collegeResult']) })
export const adminStudentDocumentParamsSchema = studentIdParamsSchema.extend({ type: z.enum(['resume', 'class10', 'class12', 'collegeResult']) })

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
