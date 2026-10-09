import assert from 'node:assert/strict'
import test from 'node:test'
import { commentBodySchema, postBodySchema, socialPageSchema } from '../src/modules/social/social.validation.js'

test('community validation rejects empty content and bounds pagination', () => {
  assert.equal(postBodySchema.safeParse({ content: ' Professional update ' }).success, true)
  assert.equal(postBodySchema.safeParse({ content: '   ' }).success, false)
  assert.equal(commentBodySchema.safeParse({ content: '   ' }).success, false)
  assert.deepEqual(socialPageSchema.parse({ page: '2', limit: '10' }), { contentType: 'feed', search: '', sort: 'newest', page: 2, limit: 10 })
  assert.equal(socialPageSchema.safeParse({ limit: 26 }).success, false)
})
