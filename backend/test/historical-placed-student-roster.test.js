import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { validatePlacedStudentRoster } from '../scripts/historical-placed-student-roster.js'

const rosterPath = new URL('../data/historical-2025-26-placed-students.json', import.meta.url)

test('C3A1b Step 1 roster file meets all fixed placement and offer quotas', async () => {
  const roster = JSON.parse(await readFile(rosterPath, 'utf8'))
  const validation = validatePlacedStudentRoster(roster)
  assert.deepEqual(validation.placedByBranch, {
    Biomedical: 9, Biotechnology: 21, Chemical: 55, Civil: 56, CSE: 70,
    Electrical: 90, ECE: 50, IT: 77, Mechanical: 76, Metallurgical: 68, Mining: 55,
  })
  assert.deepEqual(validation.distribution, { oneOffer: 550, twoOffers: 76, threeOffers: 1 })
})

test('C3A1b Step 1 roster contains one unique accounted-for student roster', async () => {
  const roster = JSON.parse(await readFile(rosterPath, 'utf8'))
  const allIds = [...roster.placedStudents, ...roster.unplacedStudents].map(student => student.studentId)
  assert.equal(allIds.length, 844)
  assert.equal(new Set(allIds).size, 844)
  assert.equal(roster.unplacedStudents.find(student => student.email === 'me085@ait.ac.in')?.rollNumber, '22ME085')
})
