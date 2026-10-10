import {useEffect,useRef,useState} from 'react'
import {usePlacementCycle} from '../placement-cycle/usePlacementCycle.js'
import {ContextualAskAi} from './ContextualAskAi.jsx'
import * as api from '../../services/admin-ai.service.js'

export function AdminPlacementIntelligence({token,provider=api}){
  const {cycle}=usePlacementCycle();const enabled=cycle.id==='2027'
  const [data,setData]=useState(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const pending=useRef(null)
  useEffect(()=>{
    if(!enabled)return
    const controller=new AbortController()
    provider.getAdminAiInsights(token,controller.signal).then(({data})=>{if(!controller.signal.aborted)setData(data)}).catch(()=>{if(!controller.signal.aborted)setError('Saved AI insights are temporarily unavailable. Normal analytics remain usable.')})
    return ()=>{controller.abort();pending.current?.abort()}
  },[enabled,token,provider])
  async function generate(){
    if(!enabled||pending.current)return
    const controller=new AbortController();pending.current=controller;setBusy(true);setError('')
    try{
      const {data:next}=await provider.generateAdminAiInsights(token,controller.signal)
      if(controller.signal.aborted)return
      setData(previous=>({...next,assessment:next.assessment??previous?.assessment??null}))
      if(next.ai.status!=='available')setError(`Placement AI is temporarily unavailable (${next.ai.reason??'unavailable'}). Previous insights and normal analytics remain available.`)
    }catch(error){if(!controller.signal.aborted)setError(error.statusCode===429?'Too many AI requests. Please wait before refreshing.':'Placement AI refresh failed. Previous insights and normal analytics remain available.')}
    finally{if(pending.current===controller){pending.current=null;if(!controller.signal.aborted)setBusy(false)}}
  }
  if(!enabled)return null
  const assessment=data?.assessment;const insight=assessment?.insight
  return <div className="space-y-4">
    <section aria-label="Placement AI Insights" className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-blue-950">Placement AI Insights</h2>
      <p className="mt-1 text-xs text-slate-500">Whole 2027 cycle · independent of dashboard filters · advisory only.</p>
      {!data&&!error&&<p role="status" className="mt-3 text-sm text-slate-600">Loading saved insights…</p>}
      {assessment?<><p className="mt-3 text-xs text-slate-500">Last analyzed: {new Date(assessment.analyzedAt).toLocaleString()}</p>{assessment.stale&&<p role="status" className="mt-2 text-sm font-semibold text-amber-800">Placement data changed — refresh AI insights.</p>}<p className="mt-4 text-sm text-slate-700">{insight.summary}</p><div className="mt-4 grid gap-4 md:grid-cols-3">{[['Highlights',insight.highlights],['Areas requiring attention',insight.concerns],['Recommended actions',insight.recommendations]].map(([title,rows])=><div key={title}><h3 className="text-sm font-bold text-slate-900">{title}</h3>{rows.length?<ul className="mt-2 space-y-2 text-sm text-slate-700">{rows.map((row,index)=><li key={index}>• {row.text}<span className="mt-1 block text-xs text-slate-500">Evidence: {row.evidenceRefs.join(', ')}</span></li>)}</ul>:<p className="mt-2 text-sm text-slate-500">No supported observation returned.</p>}</div>)}</div></>:data&&<p className="mt-4 text-sm text-slate-600">Not generated yet</p>}
      <button type="button" disabled={busy||!data} onClick={generate} className="mt-4 rounded-lg bg-blue-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{assessment?'Refresh AI Insights':'Generate AI Insights'}</button>
      {busy&&<p role="status" className="mt-3 text-sm text-slate-600">Analyzing placement facts with local AI… Previous insights stay visible.</p>}
      {error&&<p role="status" className="mt-3 text-sm text-amber-800">{error}</p>}
    </section>
    <ContextualAskAi title="Ask Placement AI" answerLabel="Placement AI" unavailableMessage="Your analytics and saved insights remain available." placeholder="Ask about current placement data…" questions={['Which branch has the lowest placement rate?','Which company has the most confirmed placements?','Where is the biggest funnel drop-off?','What should the placement team focus on next?']} onAsk={(question,signal)=>provider.askAdminPlacementAi(token,question,signal)}/>
  </div>
}
