import { z } from 'zod'
import { COMPANY_PHASE_TYPES } from './placement-drive.constants.js'

const text = (label, max) => z.string().trim().min(2, `${label} is required.`).max(max)
const optionalText = max => z.string().trim().max(max).optional().transform(value => value || undefined)
const pdfMetadataSchema = z.object({
  originalName: text('PDF filename', 255),
  storagePath: z.string().trim().min(1).max(1000),
  mimeType: z.literal('application/pdf'),
  size: z.coerce.number().int().positive(),
  uploadedAt: z.coerce.date().optional(),
})
const phaseSchema = z.object({
  phaseNumber: z.coerce.number().int().min(1).max(5),
  title: text('Phase title', 120),
  type: z.enum(COMPANY_PHASE_TYPES),
  description: optionalText(1500),
})

const companyEditablePlacementDriveSchema = z.object({
  role: z.object({
    title: text('Role title', 160),
    domain: optionalText(100),
    employmentType: z.enum(['full_time', 'internship', 'internship_to_full_time']),
    description: text('Role description', 5000),
    requiredSkills: z.array(text('Required skill', 80)).max(30).default([]),
  }),
  driveDetails: z.object({
    workMode: z.enum(['online', 'offline', 'hybrid']),
    workLocation: text('Work location', 160),
    expectedHires: z.coerce.number().int().min(1),
    compensation: z.object({
      amount: z.coerce.number().min(0).optional(),
      currency: z.string().trim().min(1).max(10).default('INR'),
      period: z.enum(['per_annum', 'per_month', 'stipend', 'not_disclosed']).default('not_disclosed'),
    }).default({ currency: 'INR', period: 'not_disclosed' }),
    applicationDeadline: z.coerce.date(),
    joiningPeriod: optionalText(200),
    serviceBond: optionalText(1000),
  }),
  eligibility: z.object({
    minimumCgpa: z.coerce.number().min(0).max(10),
    allowedBranches: z.array(text('Allowed branch', 100)).min(1).max(30),
    maximumActiveBacklogs: z.coerce.number().int().min(0).max(100),
    graduationYears: z.array(z.coerce.number().int().min(2000).max(2100)).min(1).max(10),
    additionalRequirements: optionalText(1500),
  }),
  phases: z.array(phaseSchema).min(1, 'Define at least one Company phase.').max(5, 'Define at most five Company phases.'),
})

const withPhaseRules = schema => schema.superRefine((value, context) => {
  value.phases.forEach((phase, index) => {
    if (phase.phaseNumber !== index + 1) context.addIssue({ code: 'custom', path: ['phases', index, 'phaseNumber'], message: 'Company phases must be consecutive and begin at Phase 1. Phase 0 is reserved for applicant screening.' })
  })
})

const basePlacementDriveSchema = withPhaseRules(companyEditablePlacementDriveSchema.extend({
  documents: z.object({
    companyRecruitmentInformation: pdfMetadataSchema.optional(),
    placementDriveJobDescription: pdfMetadataSchema.optional(),
  }).default({}),
}))

export const placementDriveDraftSchema = basePlacementDriveSchema
// Files are uploaded through dedicated PDF endpoints; clients never submit storage paths.
export const placementDriveCreateSchema = withPhaseRules(companyEditablePlacementDriveSchema)
export const placementDriveUpdateSchema = placementDriveCreateSchema
export const placementDriveSubmissionSchema = basePlacementDriveSchema.superRefine((value, context) => {
  if (!value.documents.companyRecruitmentInformation) context.addIssue({ code: 'custom', path: ['documents', 'companyRecruitmentInformation'], message: 'Attach the Company/Recruitment Information PDF before submitting.' })
  if (!value.documents.placementDriveJobDescription) context.addIssue({ code: 'custom', path: ['documents', 'placementDriveJobDescription'], message: 'Attach the Placement Drive/JD PDF before submitting.' })
})

export const placementDriveIdParamsSchema = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i, 'Placement Drive ID must be valid.') })
export const placementDriveDocumentParamsSchema = placementDriveIdParamsSchema.extend({ type: z.enum(['companyRecruitmentInformation', 'placementDriveJobDescription']) })
export const placementDriveReviewSchema = z.object({
  decision: z.enum(['approved', 'rejected', 'changes_requested']),
  reason: z.string().trim().min(2, 'Provide a reason for rejection or requested changes.').max(1500).optional(),
}).superRefine((value, context) => {
  if (value.decision !== 'approved' && !value.reason) context.addIssue({ code: 'custom', path: ['reason'], message: 'Provide a reason for rejection or requested changes.' })
  if (value.decision === 'approved' && value.reason) context.addIssue({ code: 'custom', path: ['reason'], message: 'A reason is only allowed for rejection or requested changes.' })
})
