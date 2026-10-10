import { z } from 'zod'

export const aiStatusQuerySchema = z.strictObject({})
export const aiEmptyBodySchema = z.strictObject({})
export const studentAiDriveParamsSchema = z.strictObject({ driveId: z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid drive ID.') })
