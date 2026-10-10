import {apiRequest} from './api-client.js'
const auth=(token,signal)=>({headers:{Authorization:`Bearer ${token}`},signal})
export const getAdminAiInsights=(token,signal)=>apiRequest('/ai/admin/insights',auth(token,signal))
export const generateAdminAiInsights=(token,signal)=>apiRequest('/ai/admin/insights',{...auth(token,signal),method:'POST',body:{}})
export const askAdminPlacementAi=(token,question,signal)=>apiRequest('/ai/admin/ask',{...auth(token,signal),method:'POST',body:{question}})
