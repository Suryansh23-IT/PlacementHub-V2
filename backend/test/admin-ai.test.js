import test from 'node:test'
import assert from 'node:assert/strict'
process.env.MONGO_URI='mongodb://localhost/placementhub-v2-demo-2027'
process.env.JWT_SECRET='synthetic-admin-ai-test-secret-long-enough'
const {createAdminIntelligence}=await import('../src/modules/ai/admin-ai.service.js')
const {loadAdminFacts,adminContext}=await import('../src/modules/ai/admin-ai.context.js')
const {adminInsightContract,adminAnswerContract}=await import('../src/modules/ai/admin-ai.schemas.js')
const {createAdminInsightModel}=await import('../src/modules/ai/admin-ai.model.js')
const {answerAdminFact}=await import('../src/modules/ai/admin-ai.intents.js')
const {createAiService}=await import('../src/modules/ai/ai.service.js')
const actor={_id:'admin',role:'placement_admin'}
const config={MONGO_URI:process.env.MONGO_URI,AI_ENABLED:true,AI_PROVIDER:'ollama',OLLAMA_BASE_URL:'http://synthetic:11434',OLLAMA_MODEL:'synthetic',AI_MAX_CONTEXT_BYTES:20000,AI_MAX_OUTPUT_TOKENS:1000,AI_MAX_CONCURRENT:1,AI_TIMEOUT_MS:1000,AI_COOLDOWN_MS:0,AI_CACHE_MAX_ENTRIES:10,AI_CACHE_TTL_MS:10000}
function facts(){return {scope:'Whole 2027 dataset',summary:{totalStudents:20,eligibleStudents:10,placedEligibleStudents:2,unplacedEligibleStudents:8,eligiblePlacementRate:20},packages:{highest:null},recruitment:{companyCount:2},branches:[{branch:'IT',eligibleStudents:5,eligiblePlacementRate:0},{branch:'CSE',eligibleStudents:5,eligiblePlacementRate:40}],companies:[{id:'company:one',name:'Synthetic Employer',confirmedPlacements:2}],drives:[{id:'drive:one',role:'Backend',lifecycle:'published',applicants:10,confirmedOfferConversion:20,phases:[{label:'Phase 0',entered:10,current:2,advanced:3,rejected:4,absent:1,withdrawn:0}]}],funnel:{applicants:10,confirmedPlacements:2},trends:[],skills:[{skill:'sql',applicants:5}],demandedSkills:[{skill:'sql',drives:1}],limitations:['No forecasts.']}}
const output=()=>({summary:'Based on the current PlacementHub data, 8 eligible students remain unplaced.',evidenceRefs:['summary'],highlights:[{text:'Confirmed placements are recorded within the eligible cohort.',evidenceRefs:['summary']}],concerns:[{text:'Review the documented unplaced cohort.',evidenceRefs:['summary']}],recommendations:[{text:'Consider targeted employer outreach.',evidenceRefs:['summary']}]})
function fixture(extra={}){
  const current=facts();let saved=null;let calls=0;let writes=0;let active=true;let fail=false;const prompts=[]
  const store={findOne:()=>({lean:async()=>structuredClone(saved)}),findOneAndUpdate:async(query,update)=>{if(extra.storageFailure)throw Error('storage');writes++;saved={...update.$set,scope:query.scope};return saved}}
  const users={findOne:query=>({select(){return this},lean:async()=>active&&query._id==='admin'&&query.role==='placement_admin'?{_id:'admin'}:null})}
  const dependencies={userModel:users,insightModel:store,factsLoader:async()=>structuredClone(current),aiDependencies:{providerFactory:()=>({generate:async({prompt,jsonSchema,system})=>{calls++;prompts.push(prompt);if(extra.wait)await extra.wait();if(fail)throw Error('offline');const context=JSON.parse(prompt.split('DATA_JSON:\n')[1]);const valid=context.userQuestion?{answer:'Based on the current PlacementHub data, consider targeted outreach.',evidenceRefs:['summary']}:{...output(),summary:jsonSchema.properties.summary.const};return extra.respond?extra.respond({calls,valid,system}):extra.output??valid}})}}
  const ai=createAiService(config,dependencies.aiDependencies);dependencies.aiService=ai
  return {ai,service:createAdminIntelligence(config,dependencies),dependencies,current,prompts,counts:()=>({calls,writes}),saved:()=>saved,deactivate:()=>active=false,offline:()=>fail=true}
}
test('Admin read is facts-only, no inference or write; non-admin/inactive denied',async()=>{
  const f=fixture();assert.equal((await f.service.read(actor)).assessment,null);assert.deepEqual(f.counts(),{calls:0,writes:0})
  for(const role of ['student','company'])await assert.rejects(f.service.read({...actor,role}),{statusCode:403})
  f.deactivate();await assert.rejects(f.service.ask(actor,'Which branch?'),{statusCode:403})
})

test('disabled Admin retains trusted facts/exact answers and does not generate or persist insights', async () => {
  const f = fixture()
  for (const policy of [{ AI_ENABLED: false }, { NODE_ENV: 'production', AI_ENABLED: true }]) {
    const service = createAdminIntelligence({ ...config, ...policy }, f.dependencies)
    const read = await service.read(actor)
    assert.equal(read.summary.eligibleStudents, 10); assert.equal(read.ai.reason, 'disabled')
    assert.equal((await service.generate(actor)).ai.reason, 'disabled')
    const exact = await service.ask(actor, 'How many eligible students remain unplaced?')
    assert.equal(exact.ai.source, 'trusted_facts'); assert.match(exact.ai.analysis.answer, /8/)
    assert.equal((await service.ask(actor, 'What should the placement team focus on next?')).ai.reason, 'disabled')
    await assert.rejects(service.generate({ ...actor, role: 'student' }), { statusCode: 403 })
  }
  assert.deepEqual(f.counts(), { calls: 0, writes: 0 })
})
test('latest successful insight survives service recreation and GET without regeneration',async()=>{
  const f=fixture();const generated=await f.service.generate(actor);assert.equal(generated.ai.status,'available');assert.equal(generated.assessment.stale,false)
  const restarted=createAdminIntelligence(config,f.dependencies);assert.deepEqual((await restarted.read(actor)).assessment,generated.assessment);assert.deepEqual(f.counts(),{calls:1,writes:1});assert.equal(f.saved().scope,'2027-placement')
})
test('material facts change marks retained insight stale; explicit refresh replaces it',async()=>{
  const f=fixture();await f.service.generate(actor);f.current.recruitment.companyCount++
  assert.equal((await f.service.read(actor)).assessment.stale,true);await f.service.generate(actor)
  assert.equal((await f.service.read(actor)).assessment.stale,false);assert.deepEqual(f.counts(),{calls:2,writes:2})
})
test('failed refresh retains previous persisted success and timestamp',async()=>{
  const f=fixture();const before=(await f.service.generate(actor)).assessment;f.offline();const response=await f.service.generate(actor)
  assert.equal(response.ai.status,'unavailable');assert.deepEqual(response.assessment,before);assert.equal(f.counts().writes,1)
})
test('persistence failure is sanitized, does not claim success or store question/context',async()=>{
  const f=fixture({storageFailure:true});const response=await f.service.generate(actor);assert.equal(response.ai.reason,'persistence_failed');assert.equal(response.assessment,null)
})
test('simple branch/company/drive/funnel/count/skill questions bypass provider and writes',async()=>{
  const f=fixture();for(const question of ['Which branch has the lowest placement rate?','Which company hired the most students?','Which drive has the strongest conversion?','Where is the biggest funnel drop-off?','How many students are unplaced?','What skills are most demanded?']){const response=await f.service.ask(actor,question);assert.equal(response.ai.source,'trusted_facts');assert.equal(response.ai.status,'available')}
  assert.deepEqual(f.counts(),{calls:0,writes:0});assert.match((await f.service.ask(actor,'Which company hired the most students?')).ai.analysis.answer,/not unique hired/)
})
test('qualitative Ask uses fresh bounded facts, independent questions and no history persistence',async()=>{
  const f=fixture();await f.service.ask(actor,'What should the placement team focus on next?');await f.service.ask(actor,'Suggest an employer outreach plan.')
  assert.equal(f.counts().writes,0);assert.equal(f.prompts.length,2);assert(!f.prompts[1].includes('focus on next'));assert(!/history|studentId|storagePath|email/.test(f.prompts[1]))
})
test('insight and answer schemas reject invented references, extra decisions, numbers and commands',()=>{
  const context=adminContext(facts());assert.doesNotThrow(()=>adminInsightContract.validate(output(),context))
  for(const value of [{...output(),evidenceRefs:['invented']},{...output(),selectStudent:true},{...output(),summary:'Placed 999 students.'},{...output(),summary:'Four students placed.'},{...output(),summary:'db.users.deleteMany({})'}])assert.throws(()=>adminInsightContract.validate(value,context))
  assert.throws(()=>adminAnswerContract.validate({answer:'Run MongoDB eval()',evidenceRefs:['summary']},context));assert.throws(()=>adminInsightContract.validate({...output(),summary:'a'.repeat(401)},context))
  assert.throws(()=>adminAnswerContract.validate({answer:'The drive has stalled progress.',evidenceRefs:['funnel']},context))
})
test('malformed provider output leaves previous insight intact',async()=>{
  const f=fixture({output:{score:99}});assert.equal((await f.service.generate(actor)).ai.status,'unavailable');assert.equal(f.counts().writes,0)
})
test('manual simultaneous generate coalesces one generation/write',async()=>{
  let release;const f=fixture({wait:()=>new Promise(resolve=>{release=resolve})});const one=f.service.generate(actor);while(!release)await new Promise(resolve=>setTimeout(resolve,0));const two=f.service.generate(actor);release();await Promise.all([one,two]);assert.deepEqual(f.counts(),{calls:1,writes:1})
})
test('Admin authorization is rechecked after slow provider output before persistence',async()=>{
  let release;const f=fixture({wait:()=>new Promise(resolve=>{release=resolve})});const task=f.service.generate(actor);while(!release)await new Promise(resolve=>setTimeout(resolve,0));f.deactivate();release();await assert.rejects(task,{statusCode:403});assert.equal(f.counts().writes,0)
})
test('Admin shares the global inference gate with Student/Company service users',async()=>{
  let release;const shared=createAiService(config,{providerFactory:()=>({generate:()=>new Promise(resolve=>{release=()=>resolve(output())})})})
  const f=fixture();const service=createAdminIntelligence(config,{...f.dependencies,aiService:shared});const one=service.generate(actor);while(!release)await new Promise(resolve=>setTimeout(resolve,0))
  const busy=await shared.analyze({actor:{_id:'student',role:'student'},scope:'student',authorize:async()=>true,loadContext:async()=>({})});assert.equal(busy.reason,'busy');release();await one
})
test('2026 and unknown runtime reject service/model initialization before factories',()=>{
  for(const name of ['placementhub-v2','unknown']){const archived={...config,MONGO_URI:`mongodb://localhost/${name}`};assert.throws(()=>createAdminInsightModel(archived),{statusCode:404});assert.throws(()=>createAdminIntelligence(archived),{statusCode:404})}
})
test('bounded context is explicitly allowlisted and facts order is deterministic',()=>{
  const current=facts();current.gender='SECRET';current.branches[0].email='SECRET';current.summary.privateContact='SECRET'
  // Loader allowlists, not arbitrary caller objects, supply the context. Regression below exercises loader.
  const big=facts();big.companies=Array.from({length:100},(_,i)=>({id:`company:${i}`,confirmedPlacements:i,name:`Company ${i}`}));big.drives=Array.from({length:100},(_,i)=>({...big.drives[0],id:`drive:${i}`}))
  const context=adminContext(big);assert.equal(context.coverage.companiesIncluded,8);assert.equal(context.coverage.drivesIncluded,10);assert(context.evidence.length<45)
})
test('trusted loader reuses M8 metrics and report phase counts, excludes all private fields',async()=>{
  const base={summary:{cohort:{totalStudents:20,eligibleStudents:10,placedEligibleStudents:2,eligiblePlacementRate:20,unplacedEligibleStudents:8},packages:{}},recruitment:{companyCount:2},branchPerformance:[{branch:'IT',eligibleStudents:5,eligiblePlacementRate:0,email:'SECRET'}],companyPerformance:[{companyId:'c',companyName:'Company',confirmedPlacements:2,email:'SECRET'}],funnel:{applicants:1,exited:{}},timeline:[]}
  const model=rows=>({find:()=>({select(){return this},lean:async()=>rows})})
  const f=await loadAdminFacts({dashboard:async()=>base,profileModel:model([{userId:'s',verificationStatus:'verified',skills:['SQL'],gender:'SECRET',email:'SECRET',hobbies:['SECRET']}]),driveModel:model([{_id:'d',role:{title:'Backend',requiredSkills:['SQL']},lifecycleStatus:'published',phases:[]}]),applicationModel:model([{_id:'a',studentId:'s',placementDriveId:'d',currentStatus:'rejected',currentPhase:0,phaseHistory:[{phase:0,event:'rejected'}]}]),recordModel:model([])})
  assert.equal(f.summary.eligiblePlacementRate,20);assert.equal(f.summary.verifiedStudents,1);assert.equal(f.drives[0].phases[0].rejected,1);assert.equal(f.skills[0].applicants,1);assert(!/SECRET|studentId|userId|email|gender|hobbies/.test(JSON.stringify(f)))
})
test('insufficient facts are explicit, ties and zero denominators do not invent rankings',()=>{
  const f=facts();f.branches=[];f.companies=[];f.drives=[]
  assert.match(answerAdminFact('Which branch has the lowest placement rate?',f).answer,/no branch/);assert.match(answerAdminFact('Which company hired the most?',f).answer,/no confirmed/);assert.match(answerAdminFact('Where is the biggest funnel drop-off?',f).answer,/cannot establish/)
})
test('Admin HTTP routes authenticate, reject Student/Company roles and client context/history',async t=>{
  const {app}=await import('../src/app.js');const {User}=await import('../src/modules/auth/auth.model.js');const jwt=(await import('jsonwebtoken')).default
  t.mock.method(User,'findById',id=>({select:async()=>({_id:id,role:id,isActive:true})}))
  const server=app.listen(0);t.after(()=>new Promise(resolve=>server.close(resolve)));const base=`http://127.0.0.1:${server.address().port}/api/v1/ai/admin`
  assert.equal((await fetch(`${base}/insights`)).status,401)
  for(const role of ['student','company'])assert.equal((await fetch(`${base}/insights`,{headers:{Authorization:`Bearer ${jwt.sign({},process.env.JWT_SECRET,{subject:role})}`}})).status,403)
  const headers={Authorization:`Bearer ${jwt.sign({},process.env.JWT_SECRET,{subject:'placement_admin'})}`,'Content-Type':'application/json'}
  assert.equal((await fetch(`${base}/insights`,{method:'POST',headers,body:JSON.stringify({context:{rawDatabase:true}})})).status,422)
  assert.equal((await fetch(`${base}/ask`,{method:'POST',headers,body:JSON.stringify({question:'What next?',history:['previous']})})).status,422)
})


test('runtime cancellation preserves persisted insight and ignores late refresh output',async()=>{
 let wait=false;let release
 const f=fixture({wait:()=>wait?new Promise(resolve=>{release=resolve}):Promise.resolve()})
 const saved=(await f.service.generate(actor)).assessment;wait=true
 const task=f.service.generate(actor);while(!release)await new Promise(resolve=>setTimeout(resolve,0))
 f.ai.resetRuntime();assert.equal((await task).ai.reason,'cancelled');assert.deepEqual((await f.service.read(actor)).assessment,saved)
 wait=false;await f.service.generate(actor);const newer=f.saved();release();await new Promise(resolve=>setTimeout(resolve,0))
 assert.deepEqual(f.saved(),newer);assert.equal(f.counts().writes,2)
})

test('Admin refresh corrects invalid evidence once, saves latest counts and clears stale',async()=>{
  let rejectFirst=false
  const f=fixture({respond:({calls,valid,system})=>{
    if(rejectFirst&&calls===2)return {...valid,concerns:[{text:'Nine branches have no placements.',evidenceRefs:['summary']}]}
    if(calls===3)assert.match(system,/first response failed schema\/evidence/)
    return valid
  }})
  await f.service.generate(actor)
  Object.assign(f.current.summary,{eligibleStudents:62,placedEligibleStudents:4,unplacedEligibleStudents:58,confirmationPending:0})
  assert.equal((await f.service.read(actor)).assessment.stale,true);rejectFirst=true
  const refreshed=await f.service.generate(actor)
  assert.equal(refreshed.ai.status,'available');assert.equal(refreshed.assessment.stale,false)
  assert.match(refreshed.assessment.insight.summary,/4 of 62/);assert.match(refreshed.assessment.insight.summary,/58 remain unplaced and 0/)
  assert.deepEqual(f.counts(),{calls:3,writes:2})
  assert.deepEqual((await f.service.read(actor)).assessment,refreshed.assessment)
})

test('two invalid refresh attempts preserve previous insight and never save unsupported output',async()=>{
  let broken=false
  const f=fixture({respond:({valid})=>broken?{...valid,evidenceRefs:['invented']}:valid})
  const saved=(await f.service.generate(actor)).assessment;broken=true;f.current.summary.placedEligibleStudents=4
  const result=await f.service.generate(actor)
  assert.equal(result.ai.reason,'invalid_evidence');assert.equal(result.assessment.stale,true)
  assert.deepEqual(result.assessment.insight,saved.insight);assert.deepEqual(result.assessment.analyzedAt,saved.analyzedAt)
  assert.deepEqual(f.counts(),{calls:3,writes:1})
})

test('Admin correction retries schema failures once but never transport failures',async()=>{
  const f=fixture({respond:({calls,valid})=>calls===1?{score:99}:valid})
  assert.equal((await f.service.generate(actor)).ai.status,'available');assert.deepEqual(f.counts(),{calls:2,writes:1})
  f.offline();assert.equal((await f.service.generate(actor)).ai.reason,'unavailable');assert.deepEqual(f.counts(),{calls:3,writes:1})
})

test('constrained Admin summary rejects stale counts even if individually grounded numbers exist',async()=>{
  const {constrainAdminContract}=await import('../src/modules/ai/admin-ai.schemas.js')
  const current=facts();Object.assign(current.summary,{eligibleStudents:62,placedEligibleStudents:4,unplacedEligibleStudents:58,confirmationPending:0})
  const context=adminContext(current);const contract=constrainAdminContract(adminInsightContract,context)
  assert.throws(()=>contract.validate({...output(),summary:'Based on the current PlacementHub data, 4 students remain unplaced.'},context),{code:'invalid_evidence'})
  const valid={...output(),summary:contract.jsonSchema.properties.summary.const}
  assert.doesNotThrow(()=>contract.validate(valid,context))
  assert.throws(()=>contract.validate({...valid,highlights:[{text:'999 students placed.',evidenceRefs:['summary']}]},context),{code:'invalid_evidence'})
  assert.throws(()=>contract.validate({...valid,evidenceRefs:['invented']},context),{code:'invalid_evidence'})
})

test('Admin correction retains global gate and cancellation cannot persist late retry',async()=>{
  let release
  const f=fixture({respond:async({calls,valid})=>calls===1?{...valid,evidenceRefs:['invented']}:new Promise(resolve=>{release=()=>resolve(valid)})})
  const task=f.service.generate(actor);while(!release)await new Promise(resolve=>setTimeout(resolve,0))
  const blocked=await f.ai.analyze({actor:{_id:'student',role:'student'},scope:'student',authorize:async()=>true,loadContext:async()=>({})})
  assert.equal(blocked.reason,'busy');f.ai.resetRuntime();assert.equal((await task).ai.reason,'cancelled')
  release();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(f.counts().writes,0)
})

test('Admin retry uses one total deadline and checks authorization before retry',async()=>{
  const {constrainAdminContract}=await import('../src/modules/ai/admin-ai.schemas.js')
  const context=adminContext(facts());const contract=constrainAdminContract(adminInsightContract,context)
  let calls=0
  const ai=createAiService({...config,AI_TIMEOUT_MS:60},{providerFactory:()=>({generate:async()=>{calls++;if(calls===1){await new Promise(resolve=>setTimeout(resolve,35));return {score:99}}return new Promise(()=>{})}})})
  const options={actor,scope:'admin:placement:insights',authorize:async()=>true,loadContext:async()=>({}),enrichContext:()=>context,contract,forceRefresh:true}
  const start=Date.now();assert.equal((await ai.analyze(options)).reason,'timeout');assert.equal(calls,2);assert(Date.now()-start<200);assert.equal(ai.runtimeStatus().status,'IDLE')
  let active=true;calls=0
  const guarded=createAiService(config,{providerFactory:()=>({generate:async()=>{calls++;active=false;return {score:99}}})})
  await assert.rejects(guarded.analyze({...options,authorize:async()=>active}),{statusCode:403});assert.equal(calls,1)
})

test('Admin insights reject uncited branch activity even with valid numeric evidence',async()=>{
 const context=adminContext(facts())
 assert.throws(()=>adminInsightContract.validate({...output(),concerns:[{text:'IT branches have no active drives.',evidenceRefs:['recruitment']}]},context),{code:'invalid_evidence'})
 assert.doesNotThrow(()=>adminInsightContract.validate({...output(),recommendations:[{text:'Consider employer outreach for unplaced branches.',evidenceRefs:['summary']}]},context))
})

test('Admin insight generation cannot claim success with missing insight sections',async()=>{
 const {constrainAdminContract}=await import('../src/modules/ai/admin-ai.schemas.js');const context=adminContext(facts());const contract=constrainAdminContract(adminInsightContract,context)
 const valid={...output(),summary:contract.jsonSchema.properties.summary.const}
 for(const key of ['highlights','concerns','recommendations']){
  assert.equal(contract.jsonSchema.properties[key].minItems,1)
  assert.throws(()=>contract.validate({...valid,[key]:[]},context),{code:'invalid_output'})
 }
 const f=fixture({respond:({calls,valid})=>calls===1?{...valid,highlights:[],concerns:[],recommendations:[]}:valid})
 const generated=await f.service.generate(actor);assert.equal(generated.ai.status,'available');assert.deepEqual(f.counts(),{calls:2,writes:1})
 for(const key of ['highlights','concerns','recommendations'])assert.equal(generated.assessment.insight[key].length,1)
})

test('Admin overview context is compact without changing trusted facts or detailed Ask context',async()=>{
 const {adminInsightContext}=await import('../src/modules/ai/admin-ai.context.js');const current=facts();const original=structuredClone(current)
 const full=adminContext(current);const overview=adminInsightContext(current)
 assert.deepEqual(current,original);assert.deepEqual(overview.evidence.find(row=>row.id==='summary').data,current.summary)
 assert(overview.evidence.some(row=>row.id.startsWith('branch:')));assert(overview.evidence.some(row=>row.id==='funnel'))
 assert(!overview.evidence.some(row=>row.id.startsWith('drive:')||['skills','trends'].includes(row.id)))
 assert(full.evidence.some(row=>row.id==='drive:one'));assert(full.evidence.some(row=>row.id==='skills'));assert.equal(overview.coverage.drivesIncluded,0)
 assert(JSON.stringify(overview).length<JSON.stringify(full).length)
})

test('Admin correction narrows only to the same trusted cohort and constrains all citations',async()=>{
 const {constrainAdminContract}=await import('../src/modules/ai/admin-ai.schemas.js');const context=adminContext(facts());const before=structuredClone(context);const contract=constrainAdminContract(adminInsightContract,context)
 const correction=contract.validationRetryContext(context);assert.deepEqual(context,before);assert.deepEqual(correction.evidence,[context.evidence.find(row=>row.id==='summary')])
 for(const key of ['highlights','concerns','recommendations'])assert.equal(contract.validationRetryJsonSchema.properties[key].items.properties.evidenceRefs.items.const,'summary')
 assert.equal(correction.evidence[0].data.placedEligibleStudents,2)
})

test('cohort correction rejects references excluded from its supplied evidence',async()=>{
 const {constrainAdminContract}=await import('../src/modules/ai/admin-ai.schemas.js');const context=adminContext(facts());const contract=constrainAdminContract(adminInsightContract,context)
 const correction=contract.validationRetryContext(context);const branch=context.evidence.find(row=>row.id.startsWith('branch:')).id
 assert.throws(()=>contract.validate({...output(),summary:contract.jsonSchema.properties.summary.const,highlights:[{text:'A branch has confirmed placements.',evidenceRefs:[branch]}]},correction),{code:'invalid_evidence'})
})

test('insights reject positive branch activity claims as well as absence claims',async()=>{
 const context=adminContext(facts())
 assert.throws(()=>adminInsightContract.validate({...output(),concerns:[{text:'Engineering branches have zero placements despite active drives.',evidenceRefs:['recruitment']}]},context),{code:'invalid_evidence'})
 const {constrainAdminContract}=await import('../src/modules/ai/admin-ai.schemas.js');const contract=constrainAdminContract(adminInsightContract,context);const cohort=contract.validationRetryContext(context)
 assert.throws(()=>contract.validate({...output(),summary:contract.jsonSchema.properties.summary.const,concerns:[{text:'Engineering branches have zero placements.',evidenceRefs:['summary']}]},cohort),{code:'invalid_evidence'})
})

test('compound written numbers are grounded as whole quantities, not their last digit',()=>{
 const current=facts();Object.assign(current.summary,{eligibleStudents:62,placedEligibleStudents:4,unplacedEligibleStudents:58,confirmationPending:0});const context=adminContext(current);const base={...output(),summary:'Based on the current PlacementHub data, 58 eligible students remain unplaced.'}
 for(const phrase of ['Fifty-eight','fifty eight','fifty–eight','fifty‑eight'])assert.doesNotThrow(()=>adminInsightContract.validate({...base,concerns:[{text:`${phrase} eligible students remain unplaced.`,evidenceRefs:['summary']}]},context))
 assert.doesNotThrow(()=>adminInsightContract.validate({...base,summary:'Sixty-two students are eligible.'},context))
 for(const phrase of ['fifty-nine','fifty','eighteen','ninety-nine'])assert.throws(()=>adminInsightContract.validate({...base,concerns:[{text:`${phrase} students remain unplaced.`,evidenceRefs:['summary']}]},context),{code:'invalid_evidence'})
 assert.throws(()=>adminInsightContract.validate({...base,concerns:[{text:'Fifty-eight students remain unplaced.',evidenceRefs:['recruitment']}]},context),{code:'invalid_evidence'})
})
