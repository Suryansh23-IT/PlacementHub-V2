import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/placementhub-v2-demo-2027'
process.env.JWT_SECRET = randomUUID().repeat(2)
const { app } = await import('../src/app.js')
const { User } = await import('../src/modules/auth/auth.model.js')
const { StudentProfile } = await import('../src/modules/students/student.model.js')
const { Company } = await import('../src/modules/companies/company.model.js')
const { InstitutionProfile } = await import('../src/modules/institution/institution.model.js')
const { getSocialProfile, getStudentMainProfile, safeUrl } = await import('../src/modules/social/social-profile.service.js')
const { SocialProfile } = await import('../src/modules/social/social-profile.model.js')
const jwt = (await import('jsonwebtoken')).default
const ids = ['000000000000000000000001', '000000000000000000000002', '000000000000000000000003']
const users = ids.map((_id, i) => ({ _id, role: ['student', 'company', 'placement_admin'][i], name: ['Student One', 'Company One', 'Admin'][i], isActive: true, password: 'PRIVATE', email: 'PRIVATE', updatedAt: new Date('2026-01-01') }))
const privateData = { resume: { storagePath: 'PRIVATE' }, phone: 'PRIVATE', verificationStatus: 'PRIVATE', reviewedBy: 'PRIVATE', placementRecords: ['PRIVATE'], applications: ['PRIVATE'], updatedAt: new Date('2026-01-01') }
const p = { userId: ids[0], branch: 'Information Technology', graduationYear: 2027, professionalHeadline: 'Build useful systems', about: 'Professional introduction', softSkills: ['Communication'], skills: ['JavaScript', 'Teamwork'], skillGroups: [{ name: 'Tools', skills: ['Git'] }], targetRole: 'Engineer', careerInterests: ['Systems'], projects: [{ title: 'Portal', description: 'Built a portal', technologies: ['React'], url: 'https://example.test', secret: 'PRIVATE' }], internships: [{ organization: 'Lab', role: 'Intern', description: 'Research', startDate: '2026-01-01', secret: 'PRIVATE' }], certifications: [{ title: 'Certificate', issuer: 'Institute', credentialUrl: 'javascript:alert(1)' }], achievements: [{ title: 'Award', description: 'Team award' }], extracurriculars: [{ title: 'Club', organization: 'College' }], leadership: [{ title: 'Lead', organization: 'College' }], professionalLinks: { github: 'https://github.com/example', private: 'PRIVATE' }, codingProfiles: [{ platform: 'Code', url: 'https://example.test/code' }], ...privateData }
const company = { userId: ids[1], companyName: 'Nexora Digital Labs', industry: 'Technology', location: 'India', website: 'https://example.test', description: 'Professional company', ...privateData }
const institution = { singletonKey: 'placementhub-v2', collegeName: 'Apex Institute of Technology', location: 'India', placementEmail: 'PRIVATE', ...privateData }
function setup(t) {
  const originals = structuredClone({ users, p, company, institution })
  const reads = []
  for (const [model, rows] of [[SocialProfile, []], [User, users], [StudentProfile, [p]], [Company, [company]], [InstitutionProfile, [institution]]]) {
    t.mock.method(model, 'findOne', query => ({ select(fields) { reads.push(fields); return { lean: async () => structuredClone(rows.find(row => Object.entries(query).every(([key, value]) => row[key] === value)) ?? null) } } }))
    for (const name of ['findOneAndUpdate', 'updateOne', 'updateMany', 'create', 'insertMany']) t.mock.method(model, name, () => { throw new Error('READ MUTATED DATABASE') })
  }
  t.mock.method(User, 'findById', id => ({ select: async () => users.find(user => user._id === id) }))
  return { check() { assert.deepEqual({ users, p, company, institution }, originals); assert(reads.length > 0); assert(reads.every(fields => !/password|resume|verificationStatus|phone|email/.test(fields))) } }
}
async function server(t) { const server = app.listen(0); t.after(() => new Promise(resolve => server.close(resolve))); return `http://127.0.0.1:${server.address().port}/api/v1/social/profiles` }
async function request(base, target, viewer, expected = 200) { const token = viewer && jwt.sign({}, process.env.JWT_SECRET, { subject: viewer._id }); const response = await fetch(`${base}/${target}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }); assert.equal(response.status, expected); return (await response.json()).data }
for (const viewer of users) test(`${viewer.role} views every Social Profile role; safe projection and pure HTTP reads`, async t => {
  const audit = setup(t), base = await server(t)
  for (const [i, target] of ids.entries()) { const data = await request(base, target, viewer); assert.equal(data.role, users[i].role); assert.equal(data.userId, target); assert(!JSON.stringify(data).includes('PRIVATE')); assert.equal(data.canViewMainProfile, i === 0 && viewer.role !== 'student'); if (i === 0) assert(!('projects' in data)) }
  audit.check()
})
for (const viewer of users.slice(1)) test(`${viewer.role} views Student Main Profile and all professional evidence without mutation`, async t => {
  const audit = setup(t), base = await server(t), data = await request(base, `${ids[0]}/main-profile`, viewer)
  for (const key of ['projects', 'internships', 'certifications', 'achievements', 'extracurriculars', 'leadership', 'softSkills', 'careerInterests', 'codingProfiles']) assert(data[key].length > 0, key)
  assert.equal(data.about, p.about); assert.equal(data.headline, p.professionalHeadline); assert(!JSON.stringify(data).includes('PRIVATE')); assert(!JSON.stringify(data).includes('javascript:')); audit.check()
})
test('Students cannot open any Main Profile, including direct requests to another student', async t => { setup(t); const base = await server(t); await request(base, `${ids[0]}/main-profile`, users[0], 403); await request(base, `${ids[1]}/main-profile`, users[0], 403) })
test('unauthenticated profile requests rejected', async t => { setup(t); const base = await server(t); for (const path of [ids[0], `${ids[0]}/main-profile`]) await request(base, path, null, 401) })
test('invalid, missing, non-student Main Profile and inactive users handled safely', async t => { setup(t); const base = await server(t); await request(base, 'invalid', users[1], 422); await request(base, '000000000000000000000009', users[1], 404); await request(base, `${ids[1]}/main-profile`, users[1], 404); const deps = { userModel: { findOne: () => ({ select: () => ({ lean: async () => null }) }) } }; await assert.rejects(getSocialProfile(users[1], ids[0], deps), { statusCode: 404 }) })
test('missing optional fields and missing source profiles use non-persisted fallbacks', async t => {
  setup(t)
  const read = value => ({ findOne: () => ({ select: () => ({ lean: async () => value }) }) })
  const social = await getSocialProfile(users[0], ids[0], { profileModel: read(null) }); assert.equal(social.headline, 'Student'); assert.deepEqual(social.skills, [])
  const main = await getStudentMainProfile(users[1], ids[0], { profileModel: read({ branch: 'IT', targetRole: 'Engineer' }) }); assert.equal(main.headline, 'Engineer'); assert.deepEqual(main.softSkills, []); assert.equal(main.about, '')
  await assert.rejects(getStudentMainProfile(users[1], ids[0], { profileModel: read(null) }), { statusCode: 404 })
  const admin = await getSocialProfile(users[0], ids[2], { institutionModel: read(null) }); assert.equal(admin.institutionName, 'Apex Institute of Technology')
})
test('professional URLs allow only safe HTTP(S) references', () => { for (const url of ['javascript:alert(1)', 'data:text/html,x', 'file:///private', 'https://user:pass@example.test']) assert.equal(safeUrl(url), undefined); assert.equal(safeUrl('https://example.test'), 'https://example.test/') })
test('new optional presentation fields validate and model does not require them', async () => {
  const { studentProfileSchema } = await import('../src/modules/students/student.validation.js')
  for (const field of ['professionalHeadline', 'about', 'softSkills']) assert.equal(studentProfileSchema.shape[field].safeParse(undefined).success, true)
  assert.equal(studentProfileSchema.shape.professionalHeadline.safeParse('x'.repeat(161)).success, false); assert.equal(studentProfileSchema.shape.about.safeParse('x'.repeat(2001)).success, false); assert.equal(studentProfileSchema.shape.softSkills.safeParse(['']).success, false)
  const profile = new StudentProfile({ userId: ids[0] }); await profile.validate(); assert.equal(profile.professionalHeadline, undefined); assert.equal(profile.softSkills, undefined)
})
