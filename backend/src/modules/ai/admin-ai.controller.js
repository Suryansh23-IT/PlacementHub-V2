import {sendSuccess} from '../../utils/api-response.js'
import {createAdminIntelligence} from './admin-ai.service.js'
export function createAdminAiControllers(config,dependencies){
  const service=createAdminIntelligence(config,dependencies)
  const send=(response,data)=>sendSuccess(response,{message:'Advisory placement intelligence.',data})
  return {read:async(request,response)=>send(response,await service.read(request.user)),generate:async(request,response)=>send(response,await service.generate(request.user)),ask:async(request,response)=>send(response,await service.ask(request.user,request.body.question))}
}
