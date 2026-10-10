import test from 'node:test'
import assert from 'node:assert/strict'
process.env.MONGO_URI = 'mongodb://localhost/placementhub-v2-demo-2027'
process.env.JWT_SECRET = 'synthetic-company-ai-test-secret-long-enough'
process.env.AI_RATE_LIMIT_MAX = '100'
const { createCompanyIntelligence, companyLimits } = await import('../src/modules/ai/company-ai.service.js')
const { companyFitContract, groupQuestionContract } = await import('../src/modules/ai/company-ai.schemas.js')
const { retrieveCandidates } = await import('../src/modules/ai/company-ai.retrieval.js')
const { companyResumeEvidence } = await import('../src/modules/ai/company-ai.resume.js')
const { getCompanyCandidateExplorer } = await import('../src/modules/analytics/company-analytics.service.js')
const {createAiService}=await import('../src/modules/ai/ai.service.js')
const actor = { _id: '000000000000000000000001', role: 'company' }
const driveId = '000000000000000000000002'; const ids = [3,4,5,6,7,8].map(n => String(n).padStart(24,'0'))
const config = { MONGO_URI: process.env.MONGO_URI, AI_ENABLED: true, AI_PROVIDER: 'ollama', OLLAMA_BASE_URL: 'http://synthetic:11434', OLLAMA_MODEL: 'synthetic', AI_TIMEOUT_MS: 1000, AI_MAX_CONTEXT_BYTES: 16384, AI_CACHE_MAX_ENTRIES: 30, AI_CACHE_TTL_MS: 60000, AI_MAX_CONCURRENT: 1, AI_COOLDOWN_MS: 0 }
function fixture(extra = {}) {
  const company = { _id: 'company', userId: actor._id, approvalStatus: 'approved', companyName: 'Synthetic Software', description: 'Builds API tools', gender: 'SECRET_GENDER', recruiterEmail: 'PRIVATE_EMAIL' }
  const drive = { _id: driveId, companyId: 'company', proposalStatus: 'approved', lifecycleStatus: 'published', role: { title: 'Backend Developer', requiredSkills: ['SQL','Node'], preferredSkills: ['Git'], description: 'Build database APIs' }, eligibility: { minimumCgpa: 8 } }
  const profiles = ids.map((id,index) => ({ userId: id, branch: index%2 ? 'IT' : 'CSE', skills: index===0 ? ['SQL','Node','Git'] : ['Python'], projects: [{ title: index===1 ? 'ML classifier' : 'API toolkit', description: index===1 ? 'Built machine learning classifier with pytorch' : 'Built Node database API project', technologies: index===1 ? ['Pytorch'] : ['Node','SQL'] }], internships: [{ role:'Developer',description:'Implemented APIs',skills:['Node'] }], resume: { storagePath:`/private/${id}.pdf`,uploadedAt:1,size:100 }, gender:'SECRET_GENDER',email:'PRIVATE_EMAIL',mbti:'SECRET_MBTI',hobbies:['SECRET_HOBBY'],cgpa:index }))
  const users = [{ ...actor,isActive:true }, ...ids.map((id,index)=>({_id:id,role:'student',isActive:true,name:`Candidate ${index}`}))]
  const applications = ids.map((id,index)=>({_id:`app${index}`,studentId:id,placementDriveId:driveId,currentPhase:0,currentStatus:'applied'}))
  let calls=0; let extracts=0; let fail=false; const extractionCache=new Map(); const prompts=[]
  function matches(row,query) { return Object.entries(query).every(([key,value])=> value && typeof value==='object' && '$in' in value ? value.$in.map(String).includes(String(row[key])) : String(row[key])===String(value)) }
  const model = rows => ({ findOne: query=>chain(rows.find(row=>matches(row,query))??null), find: query=>chain(rows.filter(row=>matches(row,query))) })
  function chain(value) { return { select(){return this},limit(){return this},sort(){return this},lean:async()=>structuredClone(value),then(resolve,reject){return Promise.resolve(structuredClone(value)).then(resolve,reject)} } }
  const dependencies = { userModel:model(users), companyModel:model([company]), driveModel:model([drive]), applicationModel:model(applications), profileModel:model(profiles), aiDependencies: { providerFactory:()=>({generate:async({prompt})=> {
    calls++; prompts.push(prompt); if (extra.generate) await extra.generate(); if(fail) throw new Error('offline')
    const context=JSON.parse(prompt.split('DATA_JSON:\n')[1]); assert(!/SECRET_|PRIVATE_EMAIL|storagePath|\/private\//.test(prompt))
    if(context.candidates) return {answer:`Based on the documented evidence available, ${context.candidates[0].name} documents relevant work.`,candidateIds:[context.candidates[0].candidateId]}
    if(context.userQuestion) return {answer:'Based on documented evidence, verify API testing in the interview.',evidenceIds:[context.evidence[0].id]}
    const sections=context.qualitySections.map(row=>({key:row.key,rating:row.evidenceIds.length?3:0,reason:'Specific documented professional work.',evidenceIds:row.evidenceIds.slice(0,1)}))
    return {sections,summary:'Based on the documented evidence available, relevant API work is present.',strengths:[{text:'Documented API project.',evidenceIds:[context.evidence.find(row=>row.type==='project').id]}],gaps:['Java is not documented.'],interviewerFocus:['Ask about API error handling.']}
  }}) }, resumeTextService:{extract:async resume=>{if(!extractionCache.has(resume.uploadedAt+resume.storagePath)){extracts++;extractionCache.set(resume.uploadedAt+resume.storagePath,{status:'extracted',text:'Projects\nDocumented backend API project with SQL.'})}return extractionCache.get(resume.uploadedAt+resume.storagePath)},peek:resume=>extractionCache.get(resume.uploadedAt+resume.storagePath)} }
  const ai=createAiService(config,dependencies.aiDependencies);dependencies.aiService=ai
  const service=createCompanyIntelligence(config,dependencies)
  return { ai,service,dependencies,company,drive,profiles,users,applications,prompts,counts:()=>({calls,extracts}),offline:()=>{fail=true} }
}
test('all-candidate objective reads are non-LLM, private data excluded and eligibility untouched',async()=>{
 const f=fixture(); const before=JSON.stringify(f.applications)
 const results=await Promise.all(ids.map(id=>f.service.read(actor,driveId,id)))
 assert.equal(results[0].deterministic.score,92); assert(results.every(row=>row.assessment===null)); assert.deepEqual(f.counts(),{calls:0,extracts:0}); assert.equal(JSON.stringify(f.applications),before)
})

test('Company resume context excludes academic sections and grades; group output rejects academic ranking',()=>{
 const raw={status:'extracted',text:'Education\nCSE degree, CPI 9.9, graduation year 2027\nProjects\nBuilt a documented backend API with SQL and testing.\nCGPA 9.9'}
 const safe=companyResumeEvidence(raw)
 assert.equal(safe.status,'extracted');assert(!/CPI|CGPA|CSE|Education|2027/.test(safe.text));assert.match(safe.text,/backend API/);assert.match(raw.text,/CPI/)
 assert.equal(companyResumeEvidence({status:'extracted',text:'Education\nCPI 9.9'}).status,'no_usable_text')
 assert.throws(()=>groupQuestionContract(ids).validate({answer:'Candidate 0 has a higher CPI.',candidateIds:[ids[0]]}),{code:'invalid_evidence'})
 assert.throws(()=>groupQuestionContract(ids).validate({answer:'Select Candidate 0 because of gender.',candidateIds:[ids[0]]}),{code:'invalid_evidence'})
})
test('company ownership, approval, role and existing application are required on every access',async()=>{
 const f=fixture()
 for(const [who,drive,id] of [[{...actor,role:'student'},driveId,ids[0]],[{...actor,_id:'foreign'},driveId,ids[0]],[actor,'foreign',ids[0]],[actor,driveId,'foreign']]) await assert.rejects(f.service.read(who,drive,id),{statusCode:404})
 f.company.approvalStatus='pending'; await assert.rejects(f.service.read(actor,driveId,ids[0]),{statusCode:404}); assert.equal(f.counts().calls,0)
})
test('independent fit, safe resume context, manual refresh and cache reuse',async()=>{
 const f=fixture(); const first=await f.service.analyze(actor,driveId,ids[0]); assert.equal(first.assessment.score,75); assert.equal(first.deterministic.score,92)
 assert.equal(first.assessment.sections.reduce((sum,row)=>sum+row.earnedPoints,0),75); assert.equal(first.resumeStatus,'extracted')
 await f.service.read(actor,driveId,ids[0]); await f.service.analyze(actor,driveId,ids[0],false); assert.equal(f.counts().calls,1)
 await f.service.ask(actor,driveId,ids[0],'What should I verify?'); await f.service.ask(actor,driveId,ids[0],'What should I verify?'); assert.deepEqual(f.counts(),{calls:2,extracts:1})
 await f.service.analyze(actor,driveId,ids[0]); assert.equal(f.counts().calls,3)
})
test('professional/resume/drive changes become stale; private changes do not',async()=>{
 const f=fixture(); await f.service.analyze(actor,driveId,ids[0]); f.profiles[0].gender='OTHER'; f.profiles[0].cgpa=0
 assert.equal((await f.service.read(actor,driveId,ids[0])).assessment.stale,false)
 f.profiles[0].projects[0].description+=' With tests'; assert.equal((await f.service.read(actor,driveId,ids[0])).assessment.stale,true)
 await f.service.analyze(actor,driveId,ids[0]); f.profiles[0].resume.uploadedAt=2; assert.equal((await f.service.read(actor,driveId,ids[0])).assessment.stale,true)
 await f.service.analyze(actor,driveId,ids[0]); f.drive.role.description+=' with observability'; assert.equal((await f.service.read(actor,driveId,ids[0])).assessment.stale,true)
})
test('failed refresh retains prior success and normal objective score',async()=>{
 const f=fixture(); const first=await f.service.analyze(actor,driveId,ids[0]); f.offline(); const next=await f.service.analyze(actor,driveId,ids[0]); assert.equal(next.ai.status,'unavailable'); assert.deepEqual(next.assessment,first.assessment); assert.equal(next.deterministic.score,92)
})
test('authorization revoked on cached result or after inference prevents exposure',async()=>{
 const f=fixture(); await f.service.analyze(actor,driveId,ids[0]); f.applications.splice(0,1); await assert.rejects(f.service.analyze(actor,driveId,ids[0],false),{statusCode:404})
 const after=fixture({generate:async()=>{after.company.approvalStatus='pending'}}); await assert.rejects(after.service.analyze(actor,driveId,ids[0]),{statusCode:404})
})
test('company fit schema rejects invented/cross-section references, scores and eligibility claims',()=>{
 const context={evidence:[{id:'project:one'}],qualitySections:['projects','experience','roleEvidence'].map(key=>({key,evidenceIds:key==='experience'?[]:['project:one']}))}
 const good={sections:context.qualitySections.map(row=>({key:row.key,rating:row.evidenceIds.length?3:0,reason:'Documented work.',evidenceIds:row.evidenceIds})),summary:'Based on documented evidence.',strengths:[{text:'Project',evidenceIds:['project:one']}],gaps:[],interviewerFocus:[]}
 assert(companyFitContract.validate(good,context))
 assert.equal(companyFitContract.validate({...good,gaps:['Missing Docker project evidence.']},context).gaps[0],'Not documented in available evidence: Docker project evidence.')
 for(const output of [{...good,score:100},{...good,summary:'Candidate meets eligibility.'},{...good,strengths:[{text:'Invented',evidenceIds:['project:unknown']}]},{...good,sections:good.sections.map(row=>({...row,rating:5}))}]) assert.throws(()=>companyFitContract.validate(output,context))
 assert.throws(()=>groupQuestionContract([ids[0]]).validate({answer:'Invented',candidateIds:[ids[1]]}))
})
test('batch limit is configurable/provider-aware, queues serially, coalesces and reuses success',async()=>{
 let release; const gate=new Promise(resolve=>{release=resolve}); const f=fixture({generate:()=>gate})
 assert.equal(companyLimits({...config,AI_BATCH_LIMIT:20}).batch,5)
 await assert.rejects(f.service.startBatch(actor,driveId,ids),{statusCode:422})
 await assert.rejects(f.service.startBatch(actor,driveId,[ids[0],ids[0]]),{statusCode:422})
 const job=await f.service.startBatch(actor,driveId,ids.slice(0,2)); const duplicate=await f.service.startBatch(actor,driveId,ids.slice(0,2)); assert.equal(job.id,duplicate.id)
 await new Promise(resolve=>setTimeout(resolve,20)); assert.equal(f.counts().calls,1); release()
 let progress
 for(let i=0;i<40;i++){progress=await f.service.pollBatch(actor,driveId,job.id);if(progress.status==='completed')break;await new Promise(resolve=>setTimeout(resolve,5))}
 assert.equal(progress.completed,2); assert.equal(progress.items[0].result.assessment.score,75); assert.equal(f.counts().calls,2)
 const reused=await f.service.startBatch(actor,driveId,ids.slice(0,2)); assert.equal(reused.id,job.id); assert.equal(f.counts().calls,2)
 await assert.rejects(f.service.pollBatch({...actor,_id:'foreign'},driveId,job.id),{statusCode:404})
})
test('group retrieves bounded relevant candidates, only extracts shortlist and caches answers',async()=>{
 const f=fixture(); const result=await f.service.groupAsk(actor,driveId,'Which candidates have documented machine-learning experience?')
 assert.equal(result.candidates.length,1); assert.equal(result.candidates[0].studentId,ids[1]); assert.equal(f.counts().extracts,1)
 await f.service.groupAsk(actor,driveId,'Which candidates have documented machine-learning experience?'); assert.equal(f.counts().calls,1)
 const compared=await f.service.groupAsk(actor,driveId,'Compare top 3 candidates for this role'); assert.equal(compared.candidates.length,3); assert(f.counts().extracts<=4)
 assert(f.prompts.every(prompt=>!prompt.includes('branch')&&!prompt.includes('SECRET_')))
})
test('no relevant group evidence returns transparent deterministic answer without inference',async()=>{
 const rows=[{studentId:ids[0],context:{evidence:[{data:{title:'API',technologies:['Node']}}]},objective:{score:50}}]
 assert.equal(retrieveCandidates(rows,'Which candidates have ML experience?',4).length,0)
})
test('objective sort occurs across cohort before pagination without provider calls',async()=>{
 const f=fixture(); const result=await getCompanyCandidateExplorer(actor._id,{sortBy:'objective_match',sortOrder:'desc',page:1,limit:2},{companyModel:f.dependencies.companyModel,placementDriveModel:f.dependencies.driveModel,applicationModel:f.dependencies.applicationModel,userModel:f.dependencies.userModel,profileModel:f.dependencies.profileModel,placementRecordModel:{find:()=>({lean:async()=>[]})},objectiveMatching:true})
 assert.equal(result.totalRecords,6);assert.equal(result.records[0].studentId,ids[0]);assert.equal(result.records[0].objectiveMatch.score,92);assert.equal(f.counts().calls,0)
 assert(result.records.every(row=>row.aiAvailable===true))
 f.drive.lifecycleStatus='completed'
 const completed=await getCompanyCandidateExplorer(actor._id,{},{companyModel:f.dependencies.companyModel,placementDriveModel:f.dependencies.driveModel,applicationModel:f.dependencies.applicationModel,userModel:f.dependencies.userModel,profileModel:f.dependencies.profileModel,placementRecordModel:{find:()=>({lean:async()=>[]})},objectiveMatching:true})
 assert(completed.records.every(row=>row.aiAvailable===false));assert.equal(f.counts().calls,0)
 await assert.rejects(f.service.read(actor,driveId,ids[0]),{statusCode:404})
})
test('2026/unknown runtime cannot initialize company intelligence',()=>{
 for(const name of ['placementhub-v2','unknown']) assert.throws(()=>createCompanyIntelligence({...config,MONGO_URI:`mongodb://localhost/${name}`}),{statusCode:404})
})

test('30-candidate Explorer computes and sorts objectives without PDF extraction or inference',async()=>{
 const f=fixture()
 for(let index=6;index<30;index++){
  const id=String(index+100).padStart(24,'0')
  f.users.push({...f.users[1],_id:id,name:`Synthetic ${index}`})
  f.profiles.push({...structuredClone(f.profiles[index%6]),userId:id})
  f.applications.push({...f.applications[0],_id:`app${index}`,studentId:id})
 }
 const started=performance.now()
 const result=await getCompanyCandidateExplorer(actor._id,{sortBy:'objective_match',sortOrder:'desc',page:1,limit:10},{companyModel:f.dependencies.companyModel,placementDriveModel:f.dependencies.driveModel,applicationModel:f.dependencies.applicationModel,userModel:f.dependencies.userModel,profileModel:f.dependencies.profileModel,placementRecordModel:{find:()=>({lean:async()=>[]})},objectiveMatching:true})
 assert.equal(result.totalRecords,30);assert.equal(result.records.length,10)
 assert(result.records.every(row=>typeof row.objectiveMatch.score==='number'))
 assert.deepEqual(f.counts(),{calls:0,extracts:0});assert(performance.now()-started<2500)
})

test('Company HTTP routes require authentication/role, reject client context and enforce ownership',async t=>{
 const {app}=await import('../src/app.js');const {User}=await import('../src/modules/auth/auth.model.js');const {Company}=await import('../src/modules/companies/company.model.js');const {PlacementDrive}=await import('../src/modules/placement-drives/placement-drive.model.js');const jwt=(await import('jsonwebtoken')).default
 t.mock.method(User,'findById',id=>({select:async()=>({_id:id,role:id==='student'?'student':'company',isActive:true})}))
 t.mock.method(User,'findOne',()=>({select(){return this},lean:async()=>actor}))
 t.mock.method(Company,'findOne',()=>({select(){return this},lean:async()=>({_id:'owned-company'})}))
 t.mock.method(PlacementDrive,'findOne',()=>({select(){return this},lean:async()=>null}))
 const server=app.listen(0);t.after(()=>new Promise(resolve=>server.close(resolve)));const base=`http://127.0.0.1:${server.address().port}/api/v1/ai/companies`;const headers=id=>({Authorization:`Bearer ${jwt.sign({},process.env.JWT_SECRET,{subject:id})}`,'Content-Type':'application/json'})
 assert.equal((await fetch(`${base}/limits`)).status,401)
 assert.equal((await fetch(`${base}/limits`,{headers:headers('student')})).status,403)
 assert.equal((await fetch(`${base}/limits`,{headers:headers(actor._id)})).status,200)
 assert.equal((await fetch(`${base}/drives/${driveId}/candidates/${ids[0]}`,{headers:headers(actor._id)})).status,404)
 assert.equal((await fetch(`${base}/drives/${driveId}/group/ask`,{method:'POST',headers:headers(actor._id),body:JSON.stringify({question:'Compare candidates',profile:{gender:'forbidden'}})})).status,422)
 assert.equal((await fetch(`${base}/drives/${driveId}/batches`,{method:'POST',headers:headers(actor._id),body:JSON.stringify({studentIds:[ids[0],ids[0]]})})).status,422)
})


test('reset cancels active and queued batch items, preserves success and prevents further calls',async()=>{
 let wait=false;let release
 const f=fixture({generate:()=>wait?new Promise(resolve=>{release=resolve}):Promise.resolve()})
 const previous=(await f.service.analyze(actor,driveId,ids[0])).assessment;wait=true
 const job=await f.service.startBatch(actor,driveId,ids.slice(1,4));while(!release)await new Promise(resolve=>setTimeout(resolve,0))
 assert.equal(f.ai.runtimeStatus().queued,2);f.ai.resetRuntime()
 const result=await f.service.pollBatch(actor,driveId,job.id);assert.equal(result.status,'completed');assert.equal(result.completed,3)
 assert(result.items.every(item=>item.status==='failed'&&item.reason==='cancelled'))
 assert.deepEqual((await f.service.read(actor,driveId,ids[0])).assessment,previous)
 release();await new Promise(resolve=>setTimeout(resolve,10));assert.equal(f.counts().calls,2);assert.equal(f.ai.runtimeStatus().status,'IDLE')
 wait=false;assert.equal((await f.service.analyze(actor,driveId,ids[1])).ai.status,'available')
})


test('reset during batch resume preparation prevents an old job starting inference afterward',async()=>{
 const f=fixture();let release
 f.dependencies.resumeTextService.extract=()=>new Promise(resolve=>{release=resolve})
 const job=await f.service.startBatch(actor,driveId,ids.slice(0,2));while(!release)await new Promise(resolve=>setTimeout(resolve,0))
 f.ai.resetRuntime();release({status:'no_usable_text',text:''});await new Promise(resolve=>setTimeout(resolve,10))
 const result=await f.service.pollBatch(actor,driveId,job.id);assert.equal(result.status,'completed');assert(result.items.every(item=>item.reason==='cancelled'));assert.equal(f.counts().calls,0)
})
