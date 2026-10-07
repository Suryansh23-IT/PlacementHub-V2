import assert from 'node:assert/strict'
import test from 'node:test'
import { CANONICAL_STUDENTS_2027, DEMO_2027_BRANCHES, DEMO_2027_STUDENT_LOGIN_CONVENTION, validateCanonicalStudents2027 } from '../data/demo-2027-m9/canonical-students.js'

test('M9A canonical source has the locked 60-student 2027 branch composition', () => {
  const result = validateCanonicalStudents2027()
  assert.equal(result.studentCount, 60)
  assert.equal(DEMO_2027_BRANCHES.length, 11)
  assert.deepEqual(result.countByBranch, Object.fromEntries(DEMO_2027_BRANCHES.map(({ label, count }) => [label, count])))
  assert.equal(result.countByBranch['Metallurgical and Materials Engineering'], 5)
  assert.equal(result.itStudentCount, 10)
})

test('M9A canonical source preserves the supplied IT names and safe login convention', () => {
  const itStudents = CANONICAL_STUDENTS_2027.filter((student) => student.branch === 'Information Technology')
  assert.deepEqual(itStudents.map((student) => student.name), ['Suyash Ghilahare', 'Ishant Singh', 'Suryansh Dwivedi', 'Divyansh Sharma', 'Satyam Tiwari', 'Adarsh Gupta', 'Akshat Mishra', 'Devesh Agrawal', 'Raj Ganatara', 'Suryakant Maurya'])
  assert.ok(itStudents.every((student) => student.cgpa > 8))
  assert.deepEqual(itStudents.map((student) => student.email), ['it01@gmail.com', 'it02@gmail.com', 'it03@gmail.com', 'it04@gmail.com', 'it05@gmail.com', 'it06@gmail.com', 'it07@gmail.com', 'it08@gmail.com', 'it09@gmail.com', 'it10@gmail.com'])
  assert.equal(CANONICAL_STUDENTS_2027.find((student) => student.branch === 'Computer Science and Engineering').email, 'cse01@gmail.com')
  assert.equal(DEMO_2027_STUDENT_LOGIN_CONVENTION.passwordEnvironmentVariable, 'DEMO_2027_STUDENT_PASSWORD')
  assert.ok(CANONICAL_STUDENTS_2027.every((student) => student.login.email === student.email && student.login.passwordEnvironmentVariable === 'DEMO_2027_STUDENT_PASSWORD'))
  assert.ok(!JSON.stringify(CANONICAL_STUDENTS_2027).includes('12345678'))
})

test('M9A canonical source contains profile and resume-ready evidence for future M10 factors', () => {
  assert.ok(CANONICAL_STUDENTS_2027.every((student) => student.graduationYear === 2027 && student.verificationStatus === 'verified' && student.placementPolicyAccepted && student.activeBacklogs === 0 && !student.disciplinaryRestriction && student.cgpa > 7))
  assert.ok(CANONICAL_STUDENTS_2027.every((student) => student.skills.length >= 5 && student.projects.length >= 2 && student.certifications.length && student.achievements.length && student.extracurriculars.length && student.resumePlan.format === 'single_column_ats_friendly_pdf'))
  assert.ok(new Set(CANONICAL_STUDENTS_2027.map((student) => student.projects[0].title)).size === 60)
  assert.ok(CANONICAL_STUDENTS_2027.some((student) => student.internships.length === 0))
  assert.ok(CANONICAL_STUDENTS_2027.some((student) => student.internships.length === 1))
})

test('M9A canonical validator rejects mutations that would break the locked cohort', () => {
  const altered = CANONICAL_STUDENTS_2027.map((student) => ({ ...student }))
  altered[0] = { ...altered[0], branch: 'Metallurgical Engineering' }
  assert.throws(() => validateCanonicalStudents2027(altered), /Biomedical Engineering must contain 5 students/)
})
