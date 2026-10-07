import assert from 'node:assert/strict'
import test from 'node:test'
import { studentProfileFormSchema } from '../src/features/student/student.schemas.js'

const baseProfile = {
  branch: 'Information Technology', graduationYear: 2027, cgpa: 8.4, activeBacklogs: 0,
  skills: ['JavaScript'], projects: [{ title: 'Placement tracker', description: 'Tracks placement activity.', technologies: ['React'], url: 'https://github.com/example/tracker' }],
}

test('student placement evidence remains valid in the current-cycle profile form', () => {
  const result = studentProfileFormSchema.safeParse({
    ...baseProfile,
    targetRole: 'Backend Engineer', careerInterests: ['Distributed systems'],
    internships: [{ organization: 'Example Labs', role: 'Engineering Intern', employmentType: 'internship', startDate: '2026-05-01', endDate: '2026-07-01', description: 'Built an API integration.', skills: ['Node.js'], url: 'https://example.com/internship' }],
    certifications: [{ title: 'Cloud Foundations', issuer: 'Example Academy', issuedOn: '2026-03-01', credentialUrl: 'https://example.com/credential' }],
    achievements: [{ title: 'Technical finalist', issuer: 'Department forum', awardedOn: '2026-02-01', description: 'Presented a working prototype.' }],
    extracurriculars: [{ title: 'Developer club', organization: 'Campus club', role: 'Volunteer', description: 'Supported a technical event.' }],
    leadership: [{ title: 'Team lead', organization: 'Campus club', role: 'Lead', description: 'Coordinated a student activity.' }],
  })
  assert.equal(result.success, true)
})

test('student placement evidence rejects an invalid experience date range', () => {
  const result = studentProfileFormSchema.safeParse({
    ...baseProfile,
    targetRole: '', careerInterests: [], certifications: [], achievements: [], extracurriculars: [], leadership: [],
    internships: [{ organization: 'Example Labs', role: 'Engineering Intern', employmentType: 'internship', startDate: '2026-07-01', endDate: '2026-05-01', description: 'Built an API integration.', skills: [], url: '' }],
  })
  assert.equal(result.success, false)
})
