import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/placementhub-v2-demo-2027'
process.env.JWT_SECRET = randomUUID().repeat(2)
process.env.SOCIAL_IMAGE_MAX_BYTES = '1024'
const directory = await mkdtemp(path.join(os.tmpdir(), 'placementhub-avatar-test-'))
process.env.SOCIAL_UPLOAD_DIR = directory
const { app } = await import('../src/app.js')
const { User } = await import('../src/modules/auth/auth.model.js')
const { StudentProfile } = await import('../src/modules/students/student.model.js')
const { Company } = await import('../src/modules/companies/company.model.js')
const { InstitutionProfile } = await import('../src/modules/institution/institution.model.js')
const { SocialProfile } = await import('../src/modules/social/social-profile.model.js')
const { socialProfileSchemas } = await import('../src/modules/social/social-profile.validation.js')
const jwt = (await import('jsonwebtoken')).default
const users = ['student','student','company','company','placement_admin'].map((role,i) => ({ _id: String(i + 1).padStart(24,'0'), role, name: `Person ${i}`, isActive: true, email: 'private@login.test', passwordHash: 'PRIVATE' }))
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM1sAAAAASUVORK5CYII=', 'base64')
function setup(t) {
  const source = { users, students: [{ userId: users[0]._id, branch: 'IT', graduationYear: 2027, professionalHeadline: 'Main headline', about: 'Main About', softSkills: ['Teamwork'], skills: ['JS'], projects: [{ title: 'Main project' }], professionalLinks: { github: 'https://github.com/example' }, resume: 'PRIVATE', phone: 'PRIVATE' }], companies: [{ userId: users[2]._id, companyName: 'Main Company', industry: 'Technology', description: 'Main company About', website: 'https://example.test', phone: 'PRIVATE' }], institution: [{ singletonKey: 'placementhub-v2', collegeName: 'Apex Institute of Technology' }] }
  const original = structuredClone(source), saved = [], writes = []
  const matches = (row, query) => Object.entries(query).every(([key,value]) => String(row[key]) === String(value))
  for (const [model, rows] of [[User, source.users], [StudentProfile, source.students], [Company, source.companies], [InstitutionProfile, source.institution], [SocialProfile, saved]]) {
    t.mock.method(model,'findOne', query => ({ select: () => ({ lean: async () => structuredClone(rows.find(row => matches(row,query)) || null) }) }))
    if (model !== SocialProfile) for (const method of ['findOneAndUpdate','updateOne','create']) t.mock.method(model, method, () => { throw new Error('MAIN SOURCE MUTATED') })
  }
  t.mock.method(SocialProfile,'findOneAndUpdate', async (query, update, options) => {
    writes.push({ query, update, options }); let row = saved.find(row => matches(row,query))
    if (!row) { row = { userId: query.userId }; saved.push(row) }
    Object.assign(row, structuredClone(update.$set), { updatedAt: new Date() })
    for (const key of Object.keys(update.$unset || {})) delete row[key]
    return row
  })
  t.mock.method(User,'findById', id => ({ select: async () => users.find(user => user._id === id) }))
  return { saved, writes, check: () => assert.deepEqual(source, original) }
}
async function server(t) { const server = app.listen(0); t.after(() => new Promise(resolve => server.close(resolve))); return `http://127.0.0.1:${server.address().port}/api/v1/social/profiles` }
async function request(base, viewer, target, input, expected = 200) {
  const response = await fetch(`${base}/${target}`, { method: input === undefined ? 'GET' : 'PATCH', headers: { ...(viewer ? { Authorization: `Bearer ${jwt.sign({}, process.env.JWT_SECRET,{subject:viewer._id})}` } : {}), ...(input && !(input instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) }, ...(input !== undefined ? { body: input instanceof FormData ? input : JSON.stringify(input) } : {}) })
  assert.equal(response.status, expected, `${viewer?.role} ${target}`); return response
}
const input = { headline:'Creative Student', bio:'Music, learning and community', hobbies:['Music'], interests:['Design'], softSkills:['Communication'], personalityType:'ENFP', achievementHighlights:['Club showcase'], clubs:['Photography'], extracurriculars:['Cricket'], volunteering:['Campus tutoring'], languages:['English'], currentlyLearning:['React'], lookingToExplore:['Entrepreneurship'], links:{ github:'https://github.com/example' } }
test('Student saves creative fields separately; every role reads them; source and subsequent GETs remain pure', async t => {
  const audit = setup(t), base = await server(t)
  const fallback = (await (await request(base,users[0],users[0]._id)).json()).data
  assert.equal(fallback.headline,'Main headline'); assert.equal(fallback.about,'Main About'); assert.deepEqual(fallback.softSkills,['Teamwork']); assert.equal(audit.saved.length,0)
  const data = (await (await request(base,users[0],users[0]._id,input)).json()).data
  for (const [key,value] of Object.entries(input)) assert.deepEqual(data[key],value)
  const snapshot = structuredClone(audit.saved)
  for (const viewer of users) {
    const read = (await (await request(base,viewer,users[0]._id)).json()).data
    assert.equal(read.about,input.bio); assert.equal(read.canEdit,viewer === users[0] || viewer.role === 'placement_admin')
    assert(!JSON.stringify(read).includes('PRIVATE')); assert(!JSON.stringify(read).includes('private@login.test'))
  }
  assert.deepEqual(audit.saved,snapshot); assert.equal(audit.writes.length,1); audit.check()
  const main = (await (await request(base,users[2],`${users[0]._id}/main-profile`)).json()).data
  assert.equal(main.headline,'Main headline'); assert.equal(main.about,'Main About'); assert.equal(main.projects[0].title,'Main project'); audit.check()
})
test('owner/Admin matrix blocks all foreign-role edits before upload and allows Admin correction', async t => {
  const audit=setup(t),base=await server(t)
  for (const viewer of users) for (const target of users) {
    const allowed=viewer._id===target._id || viewer.role==='placement_admin'
    await request(base,viewer,target._id,{bio:'Controlled correction'},allowed?200:403)
  }
  await request(base,null,users[0]._id,input,401); await request(base,users[0],'invalid',input,422)
  await request(base,users[4],'000000000000000000000099',input,404); audit.check()
})
test('Company public representative and identity overrides never copy login contact or modify Company placement data', async t => {
  const audit=setup(t),base=await server(t), values={ companyName:'Community Company', industry:'Software',location:'Pune',website:'https://example.test/',bio:'Community About', hiringDomains:['Web'], representativeName:'Demo Recruiter',designation:'Campus Recruiter',publicEmail:'public@example.test',publicPhone:'+91 100 200',representativeNote:'Demo public contact' }
  const response=(await (await request(base,users[2],users[2]._id,values)).json()).data
  for (const [key,value] of Object.entries(values)) assert.deepEqual(response[key],value)
  assert.equal(response.name,'Community Company'); assert(!('email' in response)); assert(!('phone' in response)); assert.equal(response.canViewMainProfile,false);audit.check()
})
test('Admin manages simple Official profile with AIT identity; non-admin cannot edit it', async t => {
  const audit=setup(t),base=await server(t)
  const response=(await (await request(base,users[4],users[4]._id,{bio:'Official placement office',representativeName:'Demo Coordinator',designation:'Placement Coordinator'})).json()).data
  assert.equal(response.name,'Placement Administration');assert.equal(response.label,'Official');assert.equal(response.hasAvatar,false)
  for (const viewer of users.slice(0,4)) await request(base,viewer,users[4]._id,{bio:'Forbidden'},403)
  audit.check()
})
test('validation rejects spoof/private/role fields, unsafe URLs, excessive tags, invalid MBTI and wrong-role fields', async t => {
  const audit=setup(t),base=await server(t)
  for (const value of [{userId:users[1]._id},{role:'placement_admin'},{email:'private@example.test'},{resume:'path'},{headline:'x'.repeat(161)},{bio:'x'.repeat(1201)},{hobbies:Array(13).fill('Hobby')},{interests:['']},{personalityType:'AI-inferred'},{links:{github:'javascript:alert(1)'}},{companyName:'Spoof Company'}]) await request(base,users[0],users[0]._id,value,422)
  assert.equal(audit.writes.length,0); assert(socialProfileSchemas.student.safeParse({personalityType:''}).success);audit.check()
})
function imageForm(bytes=png,mime='image/png') { const body=new FormData();body.append('bio','Avatar check');body.append('image',new Blob([bytes],{type:mime}),'../../avatar.png');return body }
for (const index of [0,2]) test(`${users[index].role} safe avatar lifecycle: upload/read/replace/remove, unauthorized/invalid writes rejected`, async t => {
  const audit=setup(t),base=await server(t), owner=users[index], foreign=users[index+1]
  const body=imageForm(); if(index===0) for(const [key,value] of Object.entries(input)) if(key!=='bio') body.append(key,typeof value==='object'?JSON.stringify(value):value)
  const data=(await (await request(base,owner,owner._id,body)).json()).data
  assert.equal(data.hasAvatar,true);assert(!JSON.stringify(data).includes(directory));assert(!('avatar' in data))
  const avatar=await request(base,users[1],`${owner._id}/avatar`);assert.equal(avatar.headers.get('x-content-type-options'),'nosniff');assert.deepEqual(Buffer.from(await avatar.arrayBuffer()),png)
  const files=await readdir(path.join(directory,'profile-avatars'));assert.equal(files.length,1);assert.match(files[0],/^[a-f\d-]{36}\.png$/)
  await request(base,foreign,owner._id,imageForm(),403)
  for (const form of [imageForm(Buffer.from('<svg/>'),'image/svg+xml'),imageForm(Buffer.from('bad')),imageForm(Buffer.alloc(2048))]) await request(base,owner,owner._id,form,422)
  await request(base,owner,owner._id,{bio:'Keeps image'});assert.deepEqual(await readdir(path.join(directory,'profile-avatars')),files)
  await request(base,owner,owner._id,imageForm());assert.notDeepEqual(await readdir(path.join(directory,'profile-avatars')),files)
  await request(base,owner,owner._id,{removeImage:true});assert.deepEqual(await readdir(path.join(directory,'profile-avatars')),[])
  const fallback=(await (await request(base,owner,owner._id)).json()).data;assert.equal(fallback.hasAvatar,false);audit.check()
})
test('failed avatar save cleans replacement and preserves original; Official avatar upload rejected', async t => {
  setup(t);const base=await server(t)
  await request(base,users[0],users[0]._id,imageForm());const files=await readdir(path.join(directory,'profile-avatars'))
  t.mock.method(SocialProfile,'findOneAndUpdate',async()=>{throw new Error('Controlled save failure')})
  await request(base,users[0],users[0]._id,imageForm(),500);assert.deepEqual(await readdir(path.join(directory,'profile-avatars')),files)
  await request(base,users[4],users[4]._id,imageForm(),422)
  await rm(path.join(directory,'profile-avatars',files[0]))
})
test('SocialProfile uses unique user relation without requiring creative values', async () => {
  assert(SocialProfile.schema.indexes().some(([keys,options])=>keys.userId===1&&options.unique))
  await new SocialProfile({userId:users[0]._id,role:'student'}).validate()
})
test.after(async()=>{assert(path.basename(directory).startsWith('placementhub-avatar-test-'));await rm(directory,{recursive:true,force:true})})
