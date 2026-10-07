import assert from 'node:assert/strict'
import test from 'node:test'
import { createPlacementCycleConfig, DEFAULT_PLACEMENT_CYCLE } from '../src/features/placement-cycle/placement-cycle-core.js'
import { loginDestinationForRole } from '../src/features/auth/role-navigation.js'

const config = createPlacementCycleConfig({ api2026: 'http://localhost:5000/api/v1', api2027: 'http://localhost:5001/api/v1' })

test('placement cycles default safely to current 2027 and preserve isolated session keys', () => {
  assert.equal(DEFAULT_PLACEMENT_CYCLE, '2027')
  assert.equal(config.normalize('invalid'), '2027')
  assert.equal(config.normalize('2026'), '2026')
  assert.equal(config.cycles['2026'].status, 'Archived')
  assert.equal(config.cycles['2027'].status, 'Current')
  assert.equal(config.cycles['2026'].apiUrl, 'http://localhost:5000/api/v1')
  assert.equal(config.cycles['2027'].apiUrl, 'http://localhost:5001/api/v1')
  assert.equal(config.sessionKey('2026'), 'placementhub_auth_2026')
  assert.equal(config.sessionKey('2027'), 'placementhub_auth_2027')
  assert.notEqual(config.sessionKey('2026'), config.sessionKey('2027'))
})

test('login does not restore a protected page belonging to another role', () => {
  assert.equal(loginDestinationForRole('student', '/admin/student-policy'), '/dashboard')
  assert.equal(loginDestinationForRole('company', '/student/placement'), '/dashboard')
  assert.equal(loginDestinationForRole('placement_admin', '/admin/reports'), '/admin/reports')
  assert.equal(loginDestinationForRole('student', '/student/placement'), '/student/placement')
})
