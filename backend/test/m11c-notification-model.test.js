import test from 'node:test'
import assert from 'node:assert/strict'
import { Notification } from '../src/modules/notifications/notification.model.js'
import { companyTargetSchema } from '../src/modules/notifications/notification.validation.js'

test('M11C candidate notification targets pass actual Mongoose validation without a DB', async () => {
  for (const target of ['all_applicants', 'active', 'phase', 'selected', 'specific']) {
    const input = { title: 'Candidate update', message: 'Please review your journey.', placementDriveId: '507f1f77bcf86cd799439701', target, requestId: '123e4567-e89b-12d3-a456-426614174000', ...(target === 'phase' ? { phaseNumber: 3 } : {}), ...(target === 'specific' ? { selectedApplicationIds: ['507f1f77bcf86cd799439702'] } : {}) }
    assert.equal(companyTargetSchema.safeParse(input).success, true)
    await new Notification({ ...input, recipientId: '507f1f77bcf86cd799439703', category: 'manual_placement_message', type: 'company_to_candidates', source: 'company', context: { action: 'view_drive', audience: target } }).validate()
  }
  await assert.rejects(new Notification({ recipientId: '507f1f77bcf86cd799439703', category: 'manual_placement_message', type: 'company_to_candidates', source: 'company', title: 'Update', message: 'Review', context: { audience: 'invented' } }).validate())
})
