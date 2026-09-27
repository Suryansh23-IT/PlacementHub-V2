import { z } from 'zod'
import { RECRUITMENT_TRANSITION_ACTIONS } from './recruitment-transition.constants.js'

export const recruitmentTransitionSchema = z.object({
  action: z.enum(RECRUITMENT_TRANSITION_ACTIONS),
  targetPhase: z.coerce.number().int().min(0).max(5).optional(),
  reason: z.string().trim().min(2, 'A reason must contain at least 2 characters.').max(1500).optional(),
}).superRefine((value, context) => {
  const needsReason = ['move_backward', 'restore_rejected', 'unselect', 'close_placed_elsewhere']
  if (needsReason.includes(value.action) && !value.reason) context.addIssue({ code: 'custom', path: ['reason'], message: 'Provide a reason for this correction or closure.' })
  if (['advance', 'move_backward'].includes(value.action) && value.targetPhase == null) context.addIssue({ code: 'custom', path: ['targetPhase'], message: 'Choose the destination phase.' })
  if (!['advance', 'move_backward'].includes(value.action) && value.targetPhase != null) context.addIssue({ code: 'custom', path: ['targetPhase'], message: 'A destination phase is only allowed when moving a candidate.' })
})
