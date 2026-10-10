import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import React, { act } from 'react'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'
const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',cacheDir:'node_modules/.vite-company-ai-test'})
const {CompanyCandidateIntelligence,CompanyExplorerTools}=await server.ssrLoadModule('/src/features/ai/CompanyIntelligence.jsx')
const {useCompanyExplorerAi}=await server.ssrLoadModule('/src/features/ai/useCompanyExplorerAi.js')
const {PlacementCycleContext}=await server.ssrLoadModule('/src/features/placement-cycle/PlacementCycleContext.jsx')
const {CompanyCandidateExplorerPage}=await server.ssrLoadModule('/src/pages/CompanyCandidateExplorerPage.jsx')
const {AuthContext}=await server.ssrLoadModule('/src/features/auth/auth.context.js')
const {MemoryRouter}=await import('react-router-dom')
const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost:5173'})
Object.assign(globalThis,{window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})
const {createRoot}=await import('react-dom/client');const h=React.createElement
const assessment={score:75,sections:[{key:'projects',label:'Project quality',earnedPoints:30,maximum:40,reason:'Documented API.'}],summary:'Based on documented evidence.',analyzedAt:'2026-10-10T00:00:00Z',strengths:[{text:'API project.'}],gaps:['Java not documented.'],interviewerFocus:['Verify tests.']}
const base={deterministic:{score:82,label:'Strong'},assessment:null,ai:{status:'not_requested'},resumeStatus:'not_analyzed'}
async function mount(component,cycle='2027') {localStorage.setItem('placementhub_active_cycle',cycle);const container=document.createElement('div');document.body.append(container);const root=createRoot(container);await act(async()=>{root.render(h(PlacementCycleContext.Provider,{value:{cycle:{id:cycle}}},component));await new Promise(resolve=>setTimeout(resolve,0))});return {container,close:async()=>{await act(async()=>root.unmount());container.remove()}}}
const button=(view,text)=>[...view.container.querySelectorAll('button')].find(row=>row.textContent===text)
test('company detail GET is instant and generation is manual, with independent objective/AI scores',async()=>{
 let calls=0;const provider={getCompanyCandidateAi:async()=>({data:base}),assessCompanyCandidateAi:async()=>{calls++;return {data:{...base,assessment,resumeStatus:'extracted'}}}}
 const view=await mount(h(CompanyCandidateIntelligence,{token:'test',driveId:'drive',studentId:'student',provider}))
 assert.equal(calls,0);assert.match(view.container.textContent,/82%/);assert.match(view.container.textContent,/Not analyzed yet/)
 await act(async()=>button(view,'Generate AI Analysis').click());assert.equal(calls,1);assert.match(view.container.textContent,/AI Candidate Fit75%/);assert.match(view.container.textContent,/Last analyzed/);assert.match(view.container.textContent,/Java not documented/);assert.match(view.container.textContent,/Verify tests/)
 await view.close()
})
test('refresh keeps previous result, blocks duplicates, preserves it on unavailable including null server result',async()=>{
 let release,calls=0;const provider={getCompanyCandidateAi:async()=>({data:{...base,assessment}}),assessCompanyCandidateAi:()=>{calls++;return new Promise(resolve=>{release=resolve})}}
 const view=await mount(h(CompanyCandidateIntelligence,{token:'test',driveId:'drive',studentId:'student',provider}))
 await act(async()=>{button(view,'Refresh AI Analysis').click();button(view,'Refresh AI Analysis')?.click()})
 assert.equal(calls,1);assert.match(view.container.textContent,/75%/);assert.match(view.container.textContent,/Analyzing/)
 await act(async()=>release({data:{...base,assessment:null,ai:{status:'unavailable',reason:'timeout'}}}));assert.match(view.container.textContent,/75%/);assert.match(view.container.textContent,/temporarily unavailable/);assert.match(view.container.textContent,/82%/)
 await view.close()
})
test('stale result has refresh warning and remount never invokes assessment',async()=>{
 let calls=0;const provider={getCompanyCandidateAi:async()=>({data:{...base,assessment:{...assessment,stale:true}}}),assessCompanyCandidateAi:async()=>{calls++;throw new Error('No automatic generation')}}
 for(let i=0;i<2;i++){const view=await mount(h(CompanyCandidateIntelligence,{token:'test',driveId:'drive',studentId:'student',provider}));assert.match(view.container.textContent,/changed — refresh/);await view.close()};assert.equal(calls,0)
})
test('individual Ask Q2 replaces Q1/A1 and does not disturb scores',async()=>{
 const provider={getCompanyCandidateAi:async()=>({data:{...base,assessment}}),askCompanyCandidateAi:async(token,drive,id,question)=>({data:{ai:{status:'available',analysis:{answer:`Reply to ${question}`}}}})}
 const view=await mount(h(CompanyCandidateIntelligence,{token:'test',driveId:'drive',studentId:'student',provider}));const chips=[...view.container.querySelectorAll('button')].filter(row=>row.textContent.includes('?'))
 await act(async()=>chips[0].click());assert.match(view.container.textContent,/Reply to What are/)
 await act(async()=>chips[1].click());assert(!view.container.textContent.includes('Reply to What are'));assert.match(view.container.textContent,/You: What should I verify/);assert.match(view.container.textContent,/82%/);assert.match(view.container.textContent,/75%/);await view.close()
})
test('archived company detail and explorer tools are hidden with no AI requests',async()=>{
 let calls=0;const provider={getCompanyCandidateAi:async()=>{calls++;throw new Error('Archived')},getCompanyAiOverview:async()=>{calls++;throw new Error('Archived')}}
 function Harness(){const intelligence=useCompanyExplorerAi('test',[{id:'app',driveId:'drive',studentId:'student'}],provider);return h(CompanyExplorerTools,{intelligence,token:'test',rows:[]})}
 for(const component of [h(CompanyCandidateIntelligence,{token:'test',driveId:'drive',studentId:'student',provider}),h(Harness)]){const view=await mount(component,'2026');assert.equal(view.container.textContent,'');await view.close()};assert.equal(calls,0)
})
test('group Ask is explicit, uses selected drive, includes bounded evidence names and replaces replies',async()=>{
 const seen=[];const provider={askCompanyGroupAi:async(token,driveId,question)=>{seen.push({driveId,question});return {data:{ai:{status:'available',analysis:{answer:`Answer ${seen.length}`}},candidates:[{name:'Professional candidate'}]}}}}
 const intelligence={enabled:true,selected:[],limits:{batch:4},job:null,error:'',start:()=>{},provider};const view=await mount(h(CompanyExplorerTools,{intelligence,token:'test',rows:[{driveId:'drive',drive:{role:'Backend'}}]}))
 assert.equal(seen.length,0);await act(async()=>{const select=view.container.querySelector('select');select.value='drive';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})
 const chips=[...view.container.querySelectorAll('button')].filter(row=>row.textContent.includes('?'))
 await act(async()=>chips[0].click());assert.match(view.container.textContent,/Answer 1/);assert.match(view.container.textContent,/Evidence used: Professional candidate/)
 await act(async()=>chips[1].click());assert(!view.container.textContent.includes('Answer 1'));assert.equal(seen[0].driveId,'drive');await view.close()
})
test('Explorer preserves existing filters and renders backend objective scores without automatic inference',async()=>{
 const original=globalThis.fetch;let generations=0;const rows=[{id:'app',studentId:'student',name:'Candidate A',branch:'IT',driveId:'drive',drive:{role:'Backend'},currentPhase:0,objectiveMatch:{score:82}}]
 globalThis.fetch=async(url)=>{if(String(url).includes('/assessment')||String(url).endsWith('/batches'))generations++;return {ok:true,json:async()=>({data:String(url).includes('/ai/')?{records:[],limits:{batch:4,group:4}}:{records:rows,totalRecords:1,page:1,limit:50,totalPages:1,appliedFilters:{}}})}}
 try{const view=await mount(h(AuthContext.Provider,{value:{session:{accessToken:'test'}}},h(MemoryRouter,null,h(CompanyCandidateExplorerPage))));assert.match(view.container.textContent,/82%/);assert.match(view.container.textContent,/Objective Match/);assert.match(view.container.textContent,/Not analyzed/);assert.equal(generations,0);assert(view.container.querySelector('input[placeholder="Branch"]'));assert(view.container.querySelector('option[value="objective_match"]'));await view.close()}finally{globalThis.fetch=original}
})
test('small batch shows progress, completed results and explicit selection limit',async()=>{
 let starts=0;const rows=[{id:'a',studentId:'s1',driveId:'drive',name:'A',drive:{role:'Backend'}},{id:'b',studentId:'s2',driveId:'drive',name:'B',drive:{role:'Backend'}}]
 const provider={getCompanyAiOverview:async()=>({data:{records:[],limits:{batch:2,group:3}}}),startCompanyAiBatch:async()=>{starts++;return {data:{id:'job',driveId:'drive',status:'running',completed:0,total:2,items:rows.map(row=>({studentId:row.studentId,status:'queued'}))}}},pollCompanyAiBatch:async()=>({data:{id:'job',driveId:'drive',status:'completed',completed:2,total:2,items:rows.map(row=>({studentId:row.studentId,status:'done',result:{applicationId:row.id,assessment}}))}})}
 function Harness(){const intelligence=useCompanyExplorerAi('test',rows,provider);return h('div',null,...rows.map(row=>h('button',{key:row.id,onClick:()=>intelligence.toggle(row)},`Choose ${row.name}`)),h(CompanyExplorerTools,{intelligence,token:'test',rows}),h('span',null,Object.keys(intelligence.records).length))}
 const view=await mount(h(Harness));assert.equal(starts,0);await act(async()=>{button(view,'Choose A').click();button(view,'Choose B').click()});await act(async()=>button(view,'Analyze Selected with AI (2/2)').click());assert.match(view.container.textContent,/0 \/ 2 completed/)
 await act(async()=>new Promise(resolve=>setTimeout(resolve,1200)));assert.match(view.container.textContent,/2 \/ 2 completed/);assert.match(view.container.textContent,/Batch finished/);assert.equal(starts,1);await view.close()
})
test('list analysis starts one candidate explicitly and completed View opens its existing detail result',async()=>{
 const original=globalThis.fetch;const requests=[];const row={id:'app',studentId:'student',name:'Candidate A',driveId:'drive',drive:{role:'Backend'},currentPhase:0,objectiveMatch:{score:82}}
 globalThis.fetch=async(url,options)=>{const path=String(url);if(path.endsWith('/batches'))requests.push(JSON.parse(options.body));return {ok:true,json:async()=>({data:path.endsWith('/batches')?{id:'job',driveId:'drive',status:'completed',completed:1,total:1,items:[]}:path.includes('/ai/')?{records:[{applicationId:'app',assessment}],limits:{batch:4,group:4}}:{records:[row],totalRecords:1,page:1,limit:50,totalPages:1,appliedFilters:{}}})}}
 try{const view=await mount(h(AuthContext.Provider,{value:{session:{accessToken:'test'}}},h(MemoryRouter,null,h(CompanyCandidateExplorerPage))));assert.equal(requests.length,0);const link=[...view.container.querySelectorAll('a')].find(node=>node.textContent.trim()==='View AI result');assert(link);assert.equal(link.getAttribute('href'),'/company/placement-drives/drive/applicants/student');const action=view.container.querySelector('button[aria-label="Analyze Candidate A with AI"]');await act(async()=>action.click());assert.deepEqual(requests,[{studentIds:['student']}]);await view.close()}finally{globalThis.fetch=original}
})

after(async()=>{await server.close();dom.window.close()})
