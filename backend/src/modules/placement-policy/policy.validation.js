import { z } from 'zod'

const text = (min, max, label) => z.string().trim().min(min, `${label} is required.`).max(max)
export const placementPolicySchema = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i).optional(), title: text(2, 200, 'Title'), academicYear: text(4, 30, 'Academic year'), version: text(1, 40, 'Version'), policyText: text(20, 30000, 'Policy text'), active: z.boolean() })
