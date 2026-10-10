import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {JSDOM} from 'jsdom'
import {createServer} from 'vite'
const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',cacheDir:'node_modules/.vite-admin-ai-test'})
const {AdminPlacementIntelligence}=await server.ssrLoadModule('/src/features/ai/AdminIntelligence.jsx')
const {PlacementCycleContext}=await server.ssrLoadModule('/src/features/placement-cycle/PlacementCycleContext.jsx')
const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost:5173'})
Object.assign(globalThis,{window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})
const {createRoot}=await import('react-dom/client');const h=React.createElement
const assessment={insight:{summary:'Based on the current PlacementHub data, review outreach.',evidenceRefs:['summary'],highlights:[{text:'Confirmed offers are documented.',evidenceRefs:['summary']}],concerns:[],recommendations:[{text:'Review employer outreach.',evidenceRefs:['summary']}]},analyzedAt:'2026-10-10T00:00:00Z',stale:false}
const base={scope:'Whole 2027',assessment:null,ai:{status:'not_requested'}}
async function mount(provider,cycle='2027'){localStorage.setItem('placementhub_active_cycle',cycle);const container=document.createElement('div');document.body.append(container);const root=createRoot(container);await act(async()=>{root.render(h(PlacementCycleContext.Provider,{value:{cycle:{id:cycle}}},h(AdminPlacementIntelligence,{token:'test',provider})));await new Promise(resolve=>setTimeout(resolve,0))});return {container,close:async()=>{await act(async()=>root.unmount());container.remove()}}}
const button=(view,label)=>[...view.container.querySelectorAll('button')].find(row=>row.textContent===label)
test('Admin panel reads saved result only on mount and generation is explicit',async()=>{
 let calls=0;const provider={getAdminAiInsights:async()=>({data:base}),generateAdminAiInsights:async()=>{calls++;return {data:{...base,assessment,ai:{status:'available'}}}}}
 const view=await mount(provider);assert.equal(calls,0);assert.match(view.container.textContent,/Not generated yet/);assert.match(view.container.textContent,/independent of dashboard filters/)
 await act(async()=>button(view,'Generate AI Insights').click());assert.equal(calls,1);assert.match(view.container.textContent,/Last analyzed/);assert.match(view.container.textContent,/Confirmed offers/);assert(!view.container.textContent.includes('Score'));await view.close()
})
test('saved insight survives remount without inference and shows stale warning',async()=>{
 let calls=0;const provider={getAdminAiInsights:async()=>({data:{...base,assessment:{...assessment,stale:true}}}),generateAdminAiInsights:async()=>{calls++;throw Error('automatic generation forbidden')}}
 for(let i=0;i<2;i++){const view=await mount(provider);assert.match(view.container.textContent,/Placement data changed/);assert.match(view.container.textContent,/review outreach/);await view.close()}assert.equal(calls,0)
})
test('refresh retains result while pending, blocks duplicate calls and preserves failed success',async()=>{
 let release,calls=0;const provider={getAdminAiInsights:async()=>({data:{...base,assessment}}),generateAdminAiInsights:()=>{calls++;return new Promise(resolve=>{release=resolve})}}
 const view=await mount(provider);await act(async()=>{button(view,'Refresh AI Insights').click();button(view,'Refresh AI Insights').click()});assert.equal(calls,1);assert.match(view.container.textContent,/review outreach/);assert.match(view.container.textContent,/Analyzing placement facts/)
 await act(async()=>release({data:{...base,ai:{status:'unavailable',reason:'timeout'}}}));assert.match(view.container.textContent,/review outreach/);assert.match(view.container.textContent,/temporarily unavailable/);await view.close()
})
test('successful explicit refresh replaces prior insight and timestamp',async()=>{
 const newer={...assessment,insight:{...assessment.insight,summary:'New validated insight.'},analyzedAt:'2026-10-11T00:00:00Z'}
 const view=await mount({getAdminAiInsights:async()=>({data:{...base,assessment}}),generateAdminAiInsights:async()=>({data:{...base,assessment:newer,ai:{status:'available'}}})})
 await act(async()=>button(view,'Refresh AI Insights').click());assert.match(view.container.textContent,/New validated insight/);assert(!view.container.textContent.includes('review outreach.'));await view.close()
})
test('Admin Ask shows latest question/answer only and keeps permanent insight',async()=>{
 const view=await mount({getAdminAiInsights:async()=>({data:{...base,assessment}}),askAdminPlacementAi:async(token,question)=>({data:{ai:{status:'available',analysis:{answer:`Trusted reply: ${question}`}}}})})
 const chips=[...view.container.querySelectorAll('button')].filter(row=>row.textContent.includes('?'))
 await act(async()=>chips[0].click());assert.match(view.container.textContent,/Trusted reply: Which branch/)
 await act(async()=>chips[1].click());assert(!view.container.textContent.includes('Trusted reply: Which branch'));assert.match(view.container.textContent,/Placement AI: Trusted reply: Which company/);assert.match(view.container.textContent,/review outreach/);await view.close()
})
test('offline Ask is non-blocking and uses Admin wording without score claims',async()=>{
 const view=await mount({getAdminAiInsights:async()=>({data:{...base,assessment}}),askAdminPlacementAi:async()=>({data:{ai:{status:'unavailable',reason:'unavailable'}}})})
 await act(async()=>button(view,'What should the placement team focus on next?').click());assert.match(view.container.textContent,/analytics and saved insights remain available/);assert(!view.container.textContent.includes('Your score'));assert.match(view.container.textContent,/review outreach/);await view.close()
})
test('2026 hides entire Admin AI UI and does not request data',async()=>{
 let calls=0;const view=await mount({getAdminAiInsights:async()=>{calls++;throw Error('archived')}},'2026');assert.equal(view.container.textContent,'');assert.equal(calls,0);await view.close()
})
after(async()=>{dom.window.close();await server.close()})


test('Admin runtime shows safe busy status and requires confirmation before reset',async()=>{
 let resets=0
 const provider={getAdminAiInsights:async()=>({data:{...base,assessment}}),getAiRuntime:async()=>({data:{status:'BUSY',runningMs:134000,queued:2,category:'candidate',provider:'ollama',model:'qwen3.5:4b'}}),resetAiRuntime:async()=>{resets++;return {data:{status:'IDLE',runningMs:0,queued:0}}}}
 const view=await mount(provider);assert.match(view.container.textContent,/Status: Busy/);assert.match(view.container.textContent,/2m 14s/);assert.match(view.container.textContent,/Queued: 2/)
 await act(async()=>button(view,'Reset AI Runtime').click());assert.equal(resets,0);assert.match(view.container.textContent,/Previously saved AI results will not be deleted/)
 await act(async()=>button(view,'Cancel').click());assert.equal(resets,0);assert(!view.container.querySelector('[role=dialog]'))
 await act(async()=>button(view,'Reset AI Runtime').click());const confirm=view.container.querySelector('[role=dialog] button:last-child')
 await act(async()=>confirm.click());assert.equal(resets,1);assert.match(view.container.textContent,/Status: Ready/);assert.match(view.container.textContent,/New AI requests can now be started/);assert.match(view.container.textContent,/review outreach/);await view.close()
})

test('failed runtime reset retains previous insight and settles button state',async()=>{
 const view=await mount({getAdminAiInsights:async()=>({data:{...base,assessment}}),getAiRuntime:async()=>({data:{status:'IDLE',queued:0,provider:'ollama',model:'local'}}),resetAiRuntime:async()=>{throw Error('offline')}})
 await act(async()=>button(view,'Reset AI Runtime').click());await act(async()=>view.container.querySelector('[role=dialog] button:last-child').click())
 assert.match(view.container.textContent,/reset failed/);assert.match(view.container.textContent,/review outreach/);assert(!view.container.querySelector('[role=dialog] button:last-child').disabled);await view.close()
})
