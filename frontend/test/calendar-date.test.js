import test from 'node:test'
import assert from 'node:assert/strict'
import { localCalendarDate, presetRange } from '../src/utils/calendar-date.js'

test('M11C calendar presets preserve positive-offset local midnight and month boundaries', () => {
  const before = process.env.TZ
  process.env.TZ = 'Asia/Calcutta'
  try {
    const now = new Date('2026-10-10T19:00:00Z')
    assert.equal(localCalendarDate(now), '2026-10-11')
    assert.deepEqual(presetRange('today', now), { dateFrom: '2026-10-11', dateTo: '2026-10-11' })
    assert.deepEqual(presetRange('month', now), { dateFrom: '2026-10-01', dateTo: '2026-10-31' })
    assert.deepEqual(presetRange('previous', now), { dateFrom: '2026-09-01', dateTo: '2026-09-30' })
    assert.deepEqual(presetRange('previous', new Date(2027, 0, 1)), { dateFrom: '2026-12-01', dateTo: '2026-12-31' })
  } finally { if (before === undefined) delete process.env.TZ; else process.env.TZ = before }
})
