import test from 'node:test'
import assert from 'node:assert/strict'
process.env.MONGO_URI = 'mongodb://localhost/placementhub-v2-demo-2027'
process.env.JWT_SECRET = 'synthetic-student-ai-secret-long-enough-for-tests'
process.env.AI_ENABLED = 'true'
process.env.AI_PROVIDER = 'ollama'
process.env.OLLAMA_BASE_URL = 'http://ollama.test:11434'
process.env.OLLAMA_MODEL = 'synthetic-model'
const { buildSafeContext } = await import('../src/modules/ai/ai.context.js')
const { calculateProfileStrength, calculateDriveMatch } = await import('../src/modules/ai/student-ai.scoring.js')
const { createStudentIntelligence } = await import('../src/modules/ai/student-ai.service.js')
const { careerContract } = await import('../src/modules/ai/student-ai.schemas.js')
const { qualityContext, qualityContract, assessmentScore } = await import('../src/modules/ai/student-ai.assessment.js')
const { app } = await import('../src/app.js')
const { User } = await import('../src/modules/auth/auth.model.js')
const { StudentProfile } = await import('../src/modules/students/student.model.js')
const { PlacementDrive } = await import('../src/modules/placement-drives/placement-drive.model.js')
const { evaluatePlacementDriveEligibility } = await import('../src/modules/applications/application.service.js')
const jwt = (await import('jsonwebtoken')).default
const {createAiService}=await import('../src/modules/ai/ai.service.js')
const actor = { _id: '000000000000000000000001', role: 'student', isActive: true }
const driveId = '000000000000000000000002'
const config = { MONGO_URI: process.env.MONGO_URI, AI_ENABLED: true, AI_PROVIDER: 'ollama', OLLAMA_BASE_URL: 'http://ollama.test:11434', OLLAMA_MODEL: 'synthetic', AI_TIMEOUT_MS: 1000, AI_MAX_CONTEXT_BYTES: 16384, AI_CACHE_MAX_ENTRIES: 30, AI_CACHE_TTL_MS: 60000, AI_MAX_CONCURRENT: 2, AI_COOLDOWN_MS: 1 }
const profile = () => ({ skills: ['JavaScript', 'React', 'Node.js', 'SQL', 'Git'], projects: [{ title: 'Portal', description: 'Built a portal', technologies: ['React'] }, { title: 'API', description: 'Built an API', technologies: ['Node.js'] }], internships: [{ role: 'Developer', description: 'Delivered a service', skills: ['SQL'] }], certifications: [{ title: 'Certificate', issuer: 'Training' }, { title: 'Credential', issuer: 'Institute' }], targetRole: 'Developer', careerInterests: ['Web development'], professionalHeadline: 'Web developer', about: 'Building useful systems', professionalLinks: { github: 'https://example.test/code', portfolio: 'https://example.test/work' }, codingProfiles: [], resume: { storagePath: '/private/old.pdf', uploadedAt: new Date(0), size: 100 } })
const query = value => ({ select: () => ({ lean: async () => value }) })
const baseOutput = () => ({ summary: 'Advisory explanation.', strengths: [], gaps: [], recommendations: [] })
function setup(overrides = {}) {
  const state = { profile: profile(), drive: { role: { title: 'Developer', requiredSkills: ['React'], preferredSkills: ['SQL'] } }, active: true, calls: 0, prompts: [] }
  const models = { profileModel: { findOne: () => query(state.profile) }, driveModel: { findOne: () => query(state.drive) }, userModel: { findById: () => query({ ...actor, isActive: state.active }) } }
  const providerFactory = () => ({ generate: async input => {
    if (state.wait) await state.wait()
    state.calls++; const context = JSON.parse(input.prompt.split('DATA_JSON:\n')[1]); state.prompts.push(context)
    if (context.userQuestion) return { answer: `Advice for ${context.userQuestion}`, evidenceIds: context.evidence.slice(0, 1).map(row => row.id) }
    if (context.qualitySections) return { sections: context.qualitySections.map(row => ({ key: row.key, rating: row.evidenceIds.length && row.documentedPoints !== 0 ? 3 : 0, reason: row.evidenceIds.length ? 'Documented evidence is relevant but outcomes need detail.' : 'No evidence documented.', evidenceIds: row.evidenceIds.slice(0, 1) })), summary: 'Professional evidence quality assessment.' }
    return context.kind === 'professional' ? { ...baseOutput(), suitableRoles: context.deterministic.suitableRoles, nextLearningSteps: ['Build a focused project.'], profileSuggestions: ['Document measurable project outcomes.'] } : baseOutput()
  } })
  const ai = createAiService({ ...config, ...overrides }, { providerFactory })
  const service = createStudentIntelligence({ ...config, ...overrides }, { ...models, aiService: ai })
  return { state, service, ai }
}

test('Profile Strength is deterministic, bounded and uses capped professional evidence', () => {
  const full = calculateProfileStrength(buildSafeContext({ profile: profile() }).context)
  assert.equal(full.score, 100); assert(full.suitableRoles.includes('Frontend Developer'))
  assert.equal(calculateProfileStrength(buildSafeContext({}).context).score, 0)
  const partial = calculateProfileStrength(buildSafeContext({ profile: { skills: ['React', 'React'], projects: [{ title: 'No evidence' }], resume: {} } }).context)
  assert.equal(partial.score, 9)
  assert.deepEqual(calculateProfileStrength(buildSafeContext({ profile: profile() }).context), full)
})

test('independent AI rubric scores are bounded, reconcile, and reject unsupported evidence', () => {
  for (const match of [false, true]) {
    const safe = buildSafeContext({ profile: profile() }, { kind: match ? 'match' : 'professional' }).context
    const context = qualityContext(safe, calculateProfileStrength(buildSafeContext({ profile: profile() }).context))
    for (const rating of [0, 1, 2, 3, 4]) {
      const output = { sections: context.qualitySections.map(row => ({ key: row.key, rating: row.evidenceIds.length ? rating : 0, evidenceIds: row.evidenceIds.slice(0, 1), reason: 'Documented professional evidence.' })), summary: 'Independent opinion.' }
      const parsed = qualityContract(match).validate(output, context)
      const score = assessmentScore(parsed, match)
      assert(score.score >= 0 && score.score <= 100)
      assert.equal(score.sections.reduce((sum, row) => sum + row.earnedPoints, 0), score.score)
      assert.equal(score.sections.reduce((sum, row) => sum + row.maximum, 0), 100)
      assert(!('objectiveWeight' in score)); assert(!('semanticWeight' in score))
      assert.throws(() => qualityContract(match).validate({ ...output, sections: output.sections.map((row, index) => index ? row : { ...row, evidenceIds: ['invented'] }) }, context), { code: 'invalid_evidence' })
      assert.throws(() => qualityContract(match).validate({ ...output, score: 100 }, context), { code: 'invalid_output' })
      if (match) assert.throws(() => qualityContract(true).validate({ ...output, summary: 'Candidate meets eligibility criteria with a high CGPA.' }, context), { code: 'invalid_evidence' })
    }
  }
})

test('explicit generation/refresh retains latest assessment; GET never generates and marks relevant revisions stale', async () => {
  const { service, state } = setup()
  assert.equal((await service.career(actor)).assessment, null); assert.equal(state.calls, 0)
  const first = await service.assessCareer(actor)
  assert.equal(first.ai.status, 'available'); assert(first.assessment.analyzedAt)
  assert.equal(first.deterministic.score, 100); assert.equal(first.assessment.score, 75)
  assert.equal((await service.career(actor)).assessment.stale, false); assert.equal(state.calls, 1)
  state.profile.hobbies = ['private']; state.profile.phone = 'private'
  assert.equal((await service.career(actor)).assessment.stale, false)
  state.profile.resume.uploadedAt = new Date(3)
  assert.equal((await service.career(actor)).assessment.stale, true)
  state.profile.skills.push('Python')
  assert.equal((await service.career(actor)).assessment.score, first.assessment.score)
  await service.assessCareer(actor); assert.equal(state.calls, 2)
  await service.assessCareer(actor); assert.equal(state.calls, 3) // explicit refresh bypasses cache
  assert.equal((await service.career(actor)).assessment.stale, false)
  state.active = false; await assert.rejects(service.career(actor), { errorCode: 'FORBIDDEN' })
})

test('refresh failure keeps previous successful AI opinion and objective evidence', async () => {
  let fail = false
  const service = createStudentIntelligence(config, { profileModel: { findOne: () => query(profile()) }, userModel: { findById: () => query(actor) }, aiDependencies: { providerFactory: () => ({ generate: async ({ prompt }) => {
    if (fail) throw new Error('offline')
    const context = JSON.parse(prompt.split('DATA_JSON:\n')[1])
    return { summary: 'Grounded.', sections: context.qualitySections.map(row => ({ key: row.key, rating: 2, reason: 'Documented.', evidenceIds: row.evidenceIds.slice(0, 1) })) }
  } }) } })
  const before = await service.assessCareer(actor); fail = true
  const after = await service.assessCareer(actor)
  assert.equal(after.ai.status, 'unavailable'); assert.deepEqual(after.assessment, before.assessment)
  assert.deepEqual(after.deterministic, before.deterministic)
})

test('safe resume evidence and stored company/drive context reach Ask and assessment only', async () => {
  const prompts = []
  const drive = { companyId: 'company', role: { title: 'Backend Engineer', description: 'Build services', employmentType: 'full_time', requiredSkills: ['SQL'] }, eligibility: { minimumCgpa: 7, allowedBranches: ['IT'], additionalRequirements: 'Public criteria' }, phases: [{ title: 'Interview', type: 'interview', description: 'Technical discussion' }] }
  const service = createStudentIntelligence(config, { profileModel: { findOne: () => query(profile()) }, userModel: { findById: () => query(actor) }, driveModel: { findOne: () => query(drive) }, companyModel: { findById: () => query({ companyName: 'SyntheticCo', description: 'Cloud services', roleDomains: ['Backend'], recruiterPhone: 'PRIVATE' }) }, resumeTextService: { extract: async () => ({ status: 'extracted', text: 'Projects\nBuilt a SQL API with measured latency.' }) }, aiDependencies: { providerFactory: () => ({ generate: async ({ prompt }) => { const context = JSON.parse(prompt.split('DATA_JSON:\n')[1]); prompts.push(context); return { answer: 'General API testing is useful.', evidenceIds: [] } } }) } })
  await service.askMatch(actor, driveId, 'Prepare?')
  const context = prompts[0]
  assert(context.evidence.some(row => row.type === 'resume' && row.data.text.includes('SQL API')))
  assert.equal(context.company.name, 'SyntheticCo'); assert.equal(context.drive.employmentType, 'full_time')
  assert.equal(context.drive.eligibilityCriteria.minimumCgpa, 7); assert.equal(context.drive.phases[0].title, 'Interview')
  assert(context.about); assert(!JSON.stringify(context).includes('PRIVATE')); assert(!JSON.stringify(context).includes('/private/'))
})

test('all eight earned dimension scores reconcile to the unchanged overall score including partial/zero evidence', () => {
  const profiles = [profile(), {}, { skills: ['React', 'SQL', 'Python', 'Git'], projects: [{ title: 'Work', description: 'Built work', technologies: ['React'] }], targetRole: 'Developer', professionalHeadline: 'Developer', professionalLinks: { github: 'https://example.test/code' } }, { professionalHeadline: 'Developer' }, { professionalHeadline: 'Developer', professionalLinks: { github: 'https://example.test/code' } }]
  for (const input of profiles) {
    const result = calculateProfileStrength(buildSafeContext({ profile: input }).context)
    assert.equal(result.breakdown.length, 8)
    assert.equal(result.breakdown.reduce((sum, row) => sum + row.maximum, 0), 100)
    assert.equal(result.breakdown.reduce((sum, row) => sum + row.earnedPoints, 0), result.score)
    assert.equal(Math.round(result.breakdown.reduce((sum, row) => sum + row.points, 0)), result.score)
    for (const row of result.breakdown) { assert(row.label); assert(row.earnedPoints >= 0 && row.earnedPoints <= row.maximum); assert(Math.abs(row.earnedPoints - row.points) <= 0.5) }
  }
  const empty = calculateProfileStrength(buildSafeContext({}).context)
  assert(empty.breakdown.every(row => row.earnedPoints === 0))
  const introOnly = calculateProfileStrength(buildSafeContext({ profile: { professionalHeadline: 'Developer' } }).context)
  assert.equal(introOnly.score, 3); assert.equal(introOnly.breakdown.find(row => row.key === 'introduction').points, 2.5)
  assert.equal(introOnly.breakdown.find(row => row.key === 'introduction').earnedPoints, 3)
})

test('career private/social/academic changes do not alter score or safe context', () => {
  const professional = profile(); const clean = buildSafeContext({ profile: professional }).context
  const poisoned = buildSafeContext({ profile: { ...professional, email: 'PRIVATE', phone: 'PRIVATE', gender: 'PRIVATE', avatar: 'PRIVATE', mbti: 'PRIVATE', hobbies: ['PRIVATE'], socialProfile: { interests: ['PRIVATE'] }, cgpa: 10, branch: 'PRIVATE', achievements: [{ title: 'Sports medal', description: 'PRIVATE' }] } }).context
  assert.deepEqual(clean, poisoned); assert(!JSON.stringify(poisoned).includes('PRIVATE'))
})

test('only technical achievement evidence contributes to Career Assistant', () => {
  const context = buildSafeContext({ profile: { achievements: [{ title: 'Hackathon prize', description: 'Built a robot' }, { title: 'Music medal', description: 'Singing' }] } }).context
  assert.equal(context.evidence.filter(row => row.type === 'achievement').length, 1)
  assert.equal(calculateProfileStrength(context).breakdown.find(row => row.key === 'credentials').points, 5)
})

test('drive match uses 60/15/25 weights and exact aliases without fuzzy Java/JavaScript confusion', () => {
  const context = buildSafeContext({ profile: { skills: ['ReactJS', 'SQL', 'JS'], projects: [{ title: 'Web', description: 'Built web UI', technologies: ['React'] }] }, drive: { role: { requiredSkills: ['React', 'NodeJS'], preferredSkills: ['SQL'] } } }, { kind: 'match' }).context
  const result = calculateDriveMatch(context)
  assert.equal(result.score, 53); assert.equal(result.label, 'Moderate'); assert.deepEqual(result.missingSkills, ['node.js']); assert.deepEqual(result.weakerEvidence, ['sql'])
  const java = calculateDriveMatch(buildSafeContext({ profile: { skills: ['JavaScript'] }, drive: { role: { requiredSkills: ['Java'] } } }, { kind: 'match' }).context)
  assert.equal(java.score, 0)
})

test('match renormalizes missing drive dimensions but missing student evidence remains zero', () => {
  const result = calculateDriveMatch(buildSafeContext({ profile: { skills: ['React'] }, drive: { role: { requiredSkills: ['React'] } } }, { kind: 'match' }).context)
  assert.equal(result.score, 71); assert.equal(result.label, 'Good')
  assert.equal(result.dimensions.find(row => row.key === 'preferred').normalizedWeight, 0)
  const preferredOnly = calculateDriveMatch(buildSafeContext({ profile: { skills: ['SQL'], internships: [{ role: 'Analyst', description: 'Queried data', skills: ['SQL'] }] }, drive: { role: { preferredSkills: ['SQL'] } } }, { kind: 'match' }).context)
  assert.equal(preferredOnly.score, 100)
  assert.equal(calculateDriveMatch(buildSafeContext({ drive: { role: { description: 'Any good engineer' } } }, { kind: 'match' }).context).score, null)
})

test('career returns grounded structured recommendations and cannot accept provider score/unsupported roles', async () => {
  const { service, state } = setup(); const result = await service.career(actor, { explain: true })
  assert.equal(result.deterministic.score, 100); assert.equal(result.ai.status, 'available'); assert.equal(result.ai.analysis.nextLearningSteps.length, 1)
  const context = state.prompts[0]
  assert.throws(() => careerContract.validate({ ...result.ai.analysis, score: 1 }, context), { code: 'invalid_output' })
  assert.throws(() => careerContract.validate({ ...result.ai.analysis, suitableRoles: ['Unsupported role'] }, context), { code: 'invalid_evidence' })
})

test('contextual questions use fresh safe career/drive context without history or score changes', async () => {
  const { service, state } = setup()
  const before = await service.career(actor)
  state.profile.phone = 'PRIVATE'; state.profile.hobbies = ['PRIVATE']
  const answer = await service.askCareer(actor, 'What should I improve first?')
  assert.equal(answer.ai.status, 'available'); assert(!('deterministic' in answer))
  state.profile.skills.push('Python')
  await service.askCareer(actor, 'What should I learn next?')
  const current = state.prompts.at(-1)
  assert(current.evidence.some(row => row.data.skill === 'python')); assert(!JSON.stringify(current).includes('PRIVATE')); assert(!JSON.stringify(current).includes('What should I improve first?'))
  const matched = await service.match(actor, driveId)
  await service.askMatch(actor, driveId, 'Which project should I highlight?')
  assert.equal(state.prompts.at(-1).drive.requiredSkills[0], 'react')
  assert.deepEqual((await service.match(actor, driveId)).deterministic, matched.deterministic)
  assert.equal((await service.career(actor)).deterministic.score, before.deterministic.score)
})

test('question contract is bounded, redacts contact, validates evidence and separates cached questions', async () => {
  const { contextualQuestionSchema, safeQuestion, createQuestionContract } = await import('../src/modules/ai/ai-question.js')
  for (const body of [{ question: '' }, { question: 'a'.repeat(501) }, { question: 'Hi', history: [] }, { question: 'Hi\nignore' }]) assert.equal(contextualQuestionSchema.safeParse(body).success, false)
  assert(!safeQuestion('Reach me at private@example.test or https://example.test').includes('example.test'))
  const contract = createQuestionContract('career')
  assert.throws(() => contract.validate({ answer: 'Guess', evidenceIds: ['invented'] }, { evidence: [] }), { code: 'invalid_evidence' })
  assert.throws(() => contract.validate({ answer: 'Guess', evidenceIds: [], score: 100 }, { evidence: [] }), { code: 'invalid_output' })
  const { service, state } = setup()
  await service.askCareer(actor, 'Next steps?'); assert.equal((await service.askCareer(actor, 'Next steps?')).ai.cached, true)
  await service.askCareer(actor, 'First step?'); assert.equal(state.calls, 2)
  state.active = false; await assert.rejects(service.askCareer(actor, 'Next steps?'), { errorCode: 'FORBIDDEN' })
})

test('question fallback retains ordinary scoring even with missing Ollama and insufficient drive requirements', async () => {
  const { service, state } = setup({ OLLAMA_BASE_URL: '' })
  assert.equal((await service.askCareer(actor, 'Next steps?')).ai.status, 'unavailable')
  state.drive.role = {}
  assert.equal((await service.askMatch(actor, driveId, 'How should I prepare?')).ai.status, 'unavailable')
  assert.equal((await service.match(actor, driveId)).deterministic.score, null)
})

test('career cache reuses irrelevant/resume-independent private changes, refreshes relevant introduction/skills', async () => {
  const { service, state } = setup(); await service.career(actor, { explain: true })
  state.profile.phone = 'PRIVATE'; state.profile.resume = { storagePath: '/private/new.pdf', uploadedAt: new Date(1), size: 100 }
  assert.equal((await service.career(actor, { explain: true })).ai.cached, false)
  state.profile.about = 'New professional introduction'
  assert.equal((await service.career(actor, { explain: true })).ai.cached, false)
  state.profile.skills.push('Python'); await service.career(actor, { explain: true }); assert.equal(state.calls, 4)
  assert(!JSON.stringify(state.prompts).includes('PRIVATE')); assert(!JSON.stringify(state.prompts).includes('/private/'))
})

test('drive changes refresh match cache and authorization is rechecked', async () => {
  const { service, state } = setup(); await service.match(actor, driveId, { explain: true })
  assert.equal((await service.match(actor, driveId, { explain: true })).ai.cached, true)
  state.drive.role.requiredSkills.push('Python'); assert.equal((await service.match(actor, driveId, { explain: true })).ai.cached, false)
  state.active = false; await assert.rejects(service.match(actor, driveId, { explain: true }), { errorCode: 'FORBIDDEN' })
})

test('disabled/missing Ollama preserves deterministic scores; insufficient requirements do not call Ollama', async () => {
  for (const override of [{ AI_ENABLED: false }, { OLLAMA_BASE_URL: '' }]) {
    const { service, state } = setup(override)
    assert.equal((await service.career(actor, { explain: true })).deterministic.score, 100)
    const match = await service.match(actor, driveId, { explain: true }); assert.equal(match.ai.status, 'unavailable'); assert.equal(match.deterministic.score, 100); assert.equal(state.calls, 0)
  }
  const { service, state } = setup(); state.drive.role.requiredSkills = []; state.drive.role.preferredSkills = []
  assert.equal((await service.match(actor, driveId, { explain: true })).deterministic.score, null); assert.equal(state.calls, 0)
})

test('high professional match does not confer eligibility or change apply rules', async () => {
  const { service } = setup()
  assert.equal((await service.match(actor, driveId)).deterministic.score, 100)
  const result = await evaluatePlacementDriveEligibility(actor._id, driveId, { profileModel: { findOne: async () => ({ verificationStatus: 'pending', cgpa: 4, branch: 'Other', activeBacklogs: 3, graduationYear: 2027 }) }, placementDriveModel: { findOne: async () => ({ proposalStatus: 'approved', lifecycleStatus: 'published', driveDetails: { applicationDeadline: new Date('2099-01-01') }, eligibility: { minimumCgpa: 7, maximumActiveBacklogs: 0, allowedBranches: ['IT'], graduationYears: [2027] } }) }, studentPolicyStatusService: async () => ({ acceptance: true }), placementRestrictionService: async () => null })
  assert.equal(result.eligible, false); assert(result.reasons.length >= 3)
})

test('provider quota, timeout and invalid student output retain deterministic evidence', async () => {
  const { AiProviderError } = await import('../src/modules/ai/ai.errors.js')
  for (const code of ['quota', 'timeout', 'invalid_output']) {
    const service = createStudentIntelligence(config, { profileModel: { findOne: () => query(profile()) }, userModel: { findById: () => query(actor) }, aiDependencies: { providerFactory: () => ({ generate: async () => { throw new AiProviderError(code) } }) } })
    const result = await service.career(actor, { explain: true })
    assert.equal(result.deterministic.score, 100); assert.equal(result.ai.status, 'unavailable'); assert.equal(result.ai.reason, code)
    assert(result.deterministic.strengths.length > 0)
  }
})

test('match labels use all four thresholds and evidence needs a documented description', () => {
  for (const [count, label] of [[0, 'Low'], [3, 'Moderate'], [4, 'Good'], [6, 'Strong']]) {
    const requirements = ['a', 'b', 'c', 'd', 'e', 'f']
    const context = buildSafeContext({ profile: { projects: [{ title: 'Work', description: 'Documented work', technologies: requirements.slice(0, count) }] }, drive: { role: { requiredSkills: requirements } } }, { kind: 'match' }).context
    assert.equal(calculateDriveMatch(context).label, label)
  }
  const incomplete = buildSafeContext({ profile: { projects: [{ title: 'Work', technologies: ['React'] }] }, drive: { role: { requiredSkills: ['React'] } } }, { kind: 'match' }).context
  assert.equal(calculateDriveMatch(incomplete).score, 71)
})

test('HTTP Student endpoints enforce roles, ownership, validation, read-only profile projection and drive visibility', async t => {
  const fields = []
  t.mock.method(User, 'findById', id => ({ select: () => { const user = { ...actor, _id: id, role: id === actor._id ? 'student' : 'company' }; return { lean: async () => user, then: resolve => resolve(user) } } }))
  t.mock.method(StudentProfile, 'findOne', filter => { assert.equal(String(filter.userId), actor._id); return { select: selected => { fields.push(selected); return { lean: async () => profile() } } } })
  t.mock.method(PlacementDrive, 'findOne', filter => { assert.equal(filter.proposalStatus, 'approved'); assert.equal(filter.lifecycleStatus, 'published'); return query(filter._id === driveId ? { role: { requiredSkills: ['React'] } } : null) })
  for (const model of [StudentProfile, PlacementDrive]) for (const method of ['create', 'updateOne', 'findOneAndUpdate']) t.mock.method(model, method, () => { throw new Error('AI MUST NOT WRITE') })
  const server = app.listen(0); t.after(() => new Promise(resolve => server.close(resolve))); const base = `http://127.0.0.1:${server.address().port}/api/v1/ai/students/me`
  const headers = role => ({ Authorization: `Bearer ${jwt.sign({}, process.env.JWT_SECRET, { subject: role === 'student' ? actor._id : driveId })}`, 'Content-Type': 'application/json' })
  assert.equal((await fetch(`${base}/career`)).status, 401)
  assert.equal((await fetch(`${base}/career`, { headers: headers('company') })).status, 403)
  const career = await fetch(`${base}/career`, { headers: headers('student') }); assert.equal(career.status, 200); assert.equal((await career.json()).data.deterministic.score, 100)
  assert.equal((await fetch(`${base}/career/explanation`, { method: 'POST', headers: headers('student'), body: JSON.stringify({ profile: 'spoofed' }) })).status, 422)
  assert.equal((await fetch(`${base}/career/ask`, { method: 'POST', headers: headers('student'), body: JSON.stringify({ question: 'Next?', history: [] }) })).status, 422)
  assert.equal((await fetch(`${base}/career/ask`, { method: 'POST', headers: headers('company'), body: JSON.stringify({ question: 'Next?' }) })).status, 403)
  assert.equal((await fetch(`${base}/drives/invalid/match`, { headers: headers('student') })).status, 422)
  assert.equal((await fetch(`${base}/drives/${driveId}/match`, { headers: headers('student') })).status, 200)
  assert.equal((await fetch(`${base}/drives/000000000000000000000099/match`, { headers: headers('student') })).status, 404)
  const realFetch = globalThis.fetch; const suppliedContexts = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).startsWith('http://127.0.0.1:')) return realFetch(url, options)
    const request = JSON.parse(options.body)
    assert.equal(request.messages.length - 1, 1); assert.match(request.messages[0].content, /untrusted/)
    const context = JSON.parse(request.messages[1].content.split('DATA_JSON:\n')[1]); suppliedContexts.push(context)
    return new Response(JSON.stringify({ done: true, done_reason: 'stop', message: { content: JSON.stringify({ answer: context.drive ? 'Highlight your React project for this role.' : 'Improve your documented project outcomes first.', evidenceIds: context.evidence.slice(0, 1).map(row => row.id) }) } }), { headers: { 'Content-Type': 'application/json' } })
  })
  for (const [path, question, expected] of [['career/ask', 'What first?', 'Improve your documented project outcomes first.'], [`drives/${driveId}/match/ask`, 'Which project?', 'Highlight your React project for this role.']]) {
    const reply = await fetch(`${base}/${path}`, { method: 'POST', headers: headers('student'), body: JSON.stringify({ question }) })
    assert.equal(reply.status, 200)
    const data = (await reply.json()).data
    assert.equal(data.ai.status, 'available'); assert.equal(data.ai.analysis.answer, expected); assert(!('deterministic' in data))
  }
  assert.equal(suppliedContexts.length, 2); assert(!('history' in suppliedContexts[1])); assert(!JSON.stringify(suppliedContexts[1]).includes('What first?'))
  assert(fields.some(value => value.includes('projects'))); assert(!fields.some(value => /phone|email|password|gender|hobbies|mbti/.test(value)))
})


test('runtime reset retains independent Career and Drive assessments and objective scores',async()=>{
 const f=setup();await f.service.assessCareer(actor);await f.service.assessMatch(actor,driveId)
 const career=await f.service.career(actor);const drive=await f.service.match(actor,driveId)
 let release;f.state.wait=()=>new Promise(resolve=>{release=resolve})
 const task=f.service.assessCareer(actor);while(!release)await new Promise(resolve=>setTimeout(resolve,0))
 f.ai.resetRuntime();assert.equal((await task).ai.reason,'cancelled')
 assert.deepEqual((await f.service.career(actor)).assessment,career.assessment);assert.deepEqual((await f.service.match(actor,driveId)).assessment,drive.assessment)
 assert.deepEqual((await f.service.career(actor)).deterministic,career.deterministic)
 f.state.wait=null;release();await new Promise(resolve=>setTimeout(resolve,0));assert.deepEqual((await f.service.career(actor)).assessment,career.assessment)
})
