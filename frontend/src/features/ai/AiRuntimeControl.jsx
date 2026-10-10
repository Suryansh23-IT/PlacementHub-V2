import {useEffect,useState} from 'react'
import * as api from '../../services/admin-ai.service.js'

export function AiRuntimeControl({token,provider=api}) {
  const [runtime,setRuntime]=useState(null);const [confirm,setConfirm]=useState(false)
  const [resetting,setResetting]=useState(false);const [message,setMessage]=useState('')
  useEffect(()=>{
    if(!provider.getAiRuntime)return
    const controller=new AbortController()
    const read=()=>provider.getAiRuntime(token,controller.signal).then(({data})=>{if(!controller.signal.aborted){setRuntime(data);setMessage(previous=>previous==='AI runtime status is temporarily unavailable.'?'':previous)}}).catch(()=>{if(!controller.signal.aborted)setMessage('AI runtime status is temporarily unavailable.')})
    void read();const timer=setInterval(read,5000)
    return ()=>{controller.abort();clearInterval(timer)}
  },[token,provider])
  async function reset(){
    if(resetting)return
    setResetting(true);setMessage('')
    try{const {data}=await provider.resetAiRuntime(token);setRuntime(previous=>({...previous,...data}));setConfirm(false);setMessage('AI runtime reset. New AI requests can now be started.')}
    catch{setMessage('AI runtime reset failed. Please try again shortly.')}
    finally{setResetting(false)}
  }
  return <section aria-label="AI Runtime" className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-bold text-blue-950">AI Runtime</h2><p className="mt-1 text-xs text-slate-600">Status: {runtime?runtime.status==='BUSY'?'Busy':'Ready':'Loading…'}{runtime?.status==='BUSY'&&` · ${runtime.category} · Running: ${Math.floor(runtime.runningMs/60000)}m ${Math.floor(runtime.runningMs/1000)%60}s`} · Queued: {runtime?.queued??0}</p>{runtime&&<p className="mt-1 text-xs text-slate-500">{runtime.provider} · {runtime.model}</p>}</div><button type="button" onClick={()=>setConfirm(true)} disabled={resetting||!runtime} className="rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-950 disabled:opacity-50">Reset AI Runtime</button></div>
    {confirm&&<div role="dialog" aria-modal="true" aria-label="Confirm AI runtime reset" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-sm text-slate-800">Reset the active AI runtime?<br/>Current and queued AI requests will be cancelled.<br/>Previously saved AI results will not be deleted.</p><div className="mt-3 flex gap-2"><button type="button" disabled={resetting} onClick={()=>setConfirm(false)} className="rounded border px-3 py-1 text-sm">Cancel</button><button type="button" disabled={resetting} onClick={reset} className="rounded bg-blue-900 px-3 py-1 text-sm text-white">{resetting?'Resetting…':'Reset AI Runtime'}</button></div></div>}
    {message&&<p role="status" className="mt-2 text-xs text-slate-600">{message}</p>}
  </section>
}
