import {User} from '../auth/auth.model.js'
import {AppError} from '../../errors/app-error.js'
import {assertAiRuntime} from './ai.guard.js'
import {fingerprint} from './ai.context.js'
import {createAiService} from './ai.service.js'
import {providerIdentity} from './providers/ai.provider.js'
import {createAdminInsightModel} from './admin-ai.model.js'
import {loadAdminFacts,adminContext} from './admin-ai.context.js'
import {adminInsightContract,adminAnswerContract,adminInsightSchema,constrainAdminContract} from './admin-ai.schemas.js'
import {answerAdminFact} from './admin-ai.intents.js'
import {safeQuestion} from './ai-question.js'
const scope='2027-placement'
export function createAdminIntelligence(config,{userModel=User,insightModel,factsLoader=loadAdminFacts,aiService,aiDependencies,now=Date.now}={}){
  assertAiRuntime(config)
  const store=insightModel??createAdminInsightModel(config);const ai=aiService??createAiService(config,aiDependencies);let generation
  ai.registerQueue?.({count:()=>0,cancel:()=>{generation=undefined}})
  async function authorize(actor){assertAiRuntime(config);if(actor?.role!=='placement_admin'||!await userModel.findOne({_id:actor._id,role:'placement_admin',isActive:true}).select('_id').lean())throw new AppError('Admin intelligence access is forbidden.',{statusCode:403,errorCode:'FORBIDDEN'});return true}
  const revision=facts=>fingerprint({facts,provider:providerIdentity(config),version:adminInsightContract.version})
  async function latest(hash){const row=await store.findOne({scope}).lean();if(!row)return null;const parsed=adminInsightSchema.safeParse(row.insight);if(!parsed.success)return null;return {insight:parsed.data,analyzedAt:row.analyzedAt,stale:row.contextFingerprint!==hash,provider:row.provider,model:row.model}}
  async function read(actor){await authorize(actor);const facts=await factsLoader();const result=await latest(revision(facts));await authorize(actor);return {scope:facts.scope,summary:facts.summary,assessment:result,ai:{status:'not_requested'}}}
  async function generate(actor){
    await authorize(actor)
    if(generation){const completed=await generation;return {...await read(actor),ai:completed.ai}}
    const epoch=ai.runtimeEpoch?.()
    const task=(async()=>{
      const facts=await factsLoader();const hash=revision(facts);const context=adminContext(facts)
      if(epoch!==ai.runtimeEpoch?.())return {...await read(actor),ai:{status:'unavailable',reason:'cancelled'}}
      const provider=await ai.analyze({actor,scope:'admin:placement:insights',authorize:()=>authorize(actor),loadContext:async()=>({}),enrichContext:()=>context,contract:constrainAdminContract(adminInsightContract,context),forceRefresh:true})
      await authorize(actor)
      if(ai.isCurrent&&!ai.isCurrent(provider))return {...await read(actor),ai:{status:'unavailable',reason:'cancelled'}}
      if(provider.status==='available'&&(!ai.isCurrent||ai.isCurrent(provider))){
        const selected=providerIdentity(config)
        try{await store.findOneAndUpdate({scope},{$set:{insight:provider.analysis,analyzedAt:new Date(now()),contextFingerprint:hash,provider:selected.provider,model:selected.model,contractVersion:adminInsightContract.version}},{upsert:true,new:true,runValidators:true})}catch{return {...await read(actor),ai:{status:'unavailable',reason:'persistence_failed'}}}
      }
      return {...await read(actor),ai:provider}
    })()
    generation=task;try{return await task}finally{if(generation===task)generation=undefined}
  }
  async function ask(actor,question){
    await authorize(actor);question=safeQuestion(question);const facts=await factsLoader();const exact=answerAdminFact(question,facts)
    if(exact){await authorize(actor);return {ai:{status:'available',analysis:exact,source:'trusted_facts'}}}
    const context=adminContext(facts)
    const provider=await ai.analyze({actor,scope:'admin:placement:ask',authorize:()=>authorize(actor),loadContext:async()=>({}),enrichContext:()=>({...context,userQuestion:question}),contract:constrainAdminContract(adminAnswerContract,context)})
    return {ai:{...provider,source:'local_ai'}}
  }
  return {read,generate,ask}
}
