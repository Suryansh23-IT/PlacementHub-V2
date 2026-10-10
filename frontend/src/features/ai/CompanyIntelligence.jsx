import { useCallback, useEffect, useRef, useState } from 'react'
import { usePlacementCycle } from '../placement-cycle/usePlacementCycle.js'
import { activePlacementCycle } from '../placement-cycle/placement-cycle.js'
import { AiAssessmentView, MatchBadge } from './StudentIntelligence.jsx'
import { ContextualAskAi } from './ContextualAskAi.jsx'
import * as api from '../../services/company-ai.service.js'

const questions = ['What are this candidate’s strongest skills for this role?', 'What should I verify in the interview?', 'Which requirements are not documented?', 'Summarize the candidate’s relevant project experience.']
function Lines({ title, items = [] }) { return items.length ? <div className="mt-3"><h3 className="text-sm font-bold text-slate-900">{title}</h3><ul className="mt-1 space-y-1 text-sm text-slate-600">{items.map((row, index) => <li key={index}>{typeof row === 'string' ? row : row.text}</li>)}</ul></div> : null }
function CurrentCandidate({ token, driveId, studentId, provider = api }) {
  const [data, setData] = useState(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const pending = useRef(null)
  useEffect(() => { const controller = new AbortController(); provider.getCompanyCandidateAi(token, driveId, studentId, controller.signal).then(result => { if (!controller.signal.aborted) setData(result.data) }).catch(() => { if (!controller.signal.aborted) setError('Candidate intelligence is unavailable. The normal candidate profile remains usable.') }); return () => controller.abort() }, [token, driveId, studentId, provider])
  useEffect(() => () => pending.current?.abort(), [])
  const ask = useCallback((question, signal) => provider.askCompanyCandidateAi(token, driveId, studentId, question, signal), [provider, token, driveId, studentId])
  async function generate() {
    if (pending.current) return
    const controller = new AbortController(); pending.current = controller; setBusy(true); setError('')
    try {
      const result = await provider.assessCompanyCandidateAi(token, driveId, studentId, controller.signal)
      if (!controller.signal.aborted && activePlacementCycle() === '2027') {
        setData(previous => result.data.ai?.status === 'unavailable' && !result.data.assessment && previous?.assessment ? { ...result.data, assessment: { ...previous.assessment, stale: true } } : result.data)
        if (result.data.ai?.status === 'unavailable') setError(`Local AI is temporarily unavailable (${result.data.ai.reason}). Please try again later.`)
      }
    } catch { if (!controller.signal.aborted) setError('AI refresh failed. The previous successful result is retained.') }
    finally { if (pending.current === controller) pending.current = null; if (!controller.signal.aborted) setBusy(false) }
  }
  return <div className="space-y-3"><section aria-label="Company candidate intelligence" className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm"><h2 className="font-bold text-blue-950">Candidate intelligence</h2><p className="mt-1 text-xs text-slate-500">Based on documented professional evidence. Advisory only; eligibility and recruitment decisions remain separate.</p>{data ? <><p className="mt-3 text-sm font-bold text-blue-950">Objective Match: <MatchBadge score={data.deterministic.score} label={data.deterministic.label} /></p><AiAssessmentView title="AI Candidate Fit" match assessment={data.assessment} busy={busy} error={error} onGenerate={generate} resumeStatus={data.assessment?.stale ? 'not_analyzed' : data.resumeStatus} /><Lines title="Strongest documented evidence" items={data.assessment?.strengths} /><Lines title="Not documented / verify" items={data.assessment?.gaps} /><Lines title="Interviewer focus" items={data.assessment?.interviewerFocus} /></> : <p role="status" className="mt-3 text-sm text-slate-600">{error || 'Loading objective evidence…'}</p>}</section><ContextualAskAi title="Ask AI about this candidate" questions={questions} onAsk={ask} /></div>
}
export function CompanyCandidateIntelligence(props) { const { cycle } = usePlacementCycle(); return cycle.id === '2027' ? <CurrentCandidate key={`${props.driveId}:${props.studentId}:${props.token}`} {...props} /> : null }

export function CompanyExplorerTools({ intelligence, token, rows }) {
  const { selected, limits, job, error, start, provider } = intelligence
  const [driveId, setDriveId] = useState('')
  const drives = [...new Map(rows.filter(row => row.aiAvailable !== false).map(row => [row.driveId, row.drive?.role ?? row.driveId])).entries()]
  const ask = useCallback(async (question, signal) => {
    const result = await provider.askCompanyGroupAi(token, driveId, question, signal)
    if (result.data.ai.status === 'available' && result.data.candidates?.length) result.data.ai.analysis.answer += `\n\nEvidence used: ${result.data.candidates.map(row => row.name).join(', ')}. Retrieval uses structured profiles and cached resume excerpts; only the relevant shortlist is analyzed.`
    return result
  }, [provider, token, driveId])
  if (!intelligence.enabled) return null
  return <section className="space-y-3 rounded-2xl border border-blue-100 bg-blue-50/30 p-4"><h2 className="font-bold text-blue-950">Candidate AI review</h2><p className="text-sm text-slate-600">Objective matches are instant. Select up to {limits.batch} candidates from one drive for independent, queued AI reviews. Only selected candidates use the model.</p><button disabled={!selected.length || job && job.status !== 'completed'} onClick={start} className="rounded-lg bg-blue-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Analyze Selected with AI ({selected.length}/{limits.batch})</button>{job && <div role="status" className="text-sm text-blue-950"><p>{job.status === 'completed' ? 'Batch finished' : 'Analyzing candidates'} · {job.completed} / {job.total} completed</p><ul>{job.items.map(item => <li key={item.studentId}>{rows.find(row => row.studentId === item.studentId)?.name ?? item.studentId}: {item.status}{item.reason ? ` (${item.reason})` : ''}</li>)}</ul></div>}{error && <p role="status" className="text-sm text-slate-600">{error}</p>}<label className="block text-sm font-semibold text-blue-950">Drive for group question<select className="ml-2 rounded-lg border bg-white p-2" value={driveId} onChange={event => setDriveId(event.target.value)}><option value="">Choose a drive</option>{drives.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>{driveId && <ContextualAskAi key={driveId} title="Ask AI about candidates" questions={['Who has the strongest documented backend experience?', 'Find candidates with MERN and database project evidence.', 'Which candidates have documented machine-learning experience?', 'Compare the strongest 3 candidates for this role.']} onAsk={ask} />}</section>
}
