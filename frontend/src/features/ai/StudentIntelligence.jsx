import { useCallback, useEffect, useRef, useState } from 'react'
import { usePlacementCycle } from '../placement-cycle/usePlacementCycle.js'
import { activePlacementCycle } from '../placement-cycle/placement-cycle.js'
import { getStudentIntelligence, askStudentIntelligence, assessStudentIntelligence } from '../../services/ai.service.js'
import { ContextualAskAi } from './ContextualAskAi.jsx'

const careerQuestions = ['What should I improve first?', 'Make me a 7-day preparation plan.', 'Which role suits my profile best?', 'What should I learn next?']
const matchQuestions = ['How should I prepare for this job?', 'What should I study first?', 'Which project should I highlight?', 'Give me likely interview topics.']
export function MatchBadge({ score, label }) {
  return <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-sm font-bold text-blue-900">{score == null ? label : `${score}% · ${label}`}</span>
}
function EvidenceList({ title, items = [] }) {
  if (!items.length) return null
  return <div><h3 className="text-sm font-bold text-slate-900">{title}</h3><ul className="mt-2 space-y-1 text-sm text-slate-600">{items.slice(0, 6).map((item, index) => <li key={index}>{typeof item === 'string' ? item : item.text}</li>)}</ul></div>
}

export function AiAssessmentView({ assessment, match, busy, error, onGenerate, resumeStatus }) {
  return <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/40 p-4" aria-label={match ? 'AI Role Fit' : 'AI Assessment'}>
    <div className="flex flex-wrap justify-between gap-2"><h3 className="font-bold text-blue-950">{match ? 'AI Role Fit' : 'AI Assessment Score'}</h3>{assessment && <strong className="text-blue-900">{assessment.score}{match ? '%' : '/100'}</strong>}</div>
    <p className="mt-1 text-xs text-slate-500">Independent local AI opinion · never combined with your objective score.</p>
    {!assessment && <p className="mt-3 text-sm text-slate-600">Not analyzed yet</p>}
    {assessment && <><p className="mt-3 text-sm text-slate-700">{assessment.summary}</p><dl className="mt-3 space-y-2">{assessment.sections.map(row => <div key={row.key} className="text-sm"><div className="flex justify-between gap-3"><dt className="font-medium text-slate-700">{row.label}</dt><dd className="font-bold tabular-nums text-blue-900">{row.earnedPoints}/{row.maximum}</dd></div><p className="mt-1 text-xs text-slate-500">{row.reason}</p></div>)}</dl><p className="mt-3 text-xs text-slate-500">Last analyzed: <time dateTime={assessment.analyzedAt}>{new Date(assessment.analyzedAt).toLocaleString()}</time></p></>}
    {assessment?.stale && <p role="status" className="mt-3 text-sm font-medium text-amber-800">Profile, resume or role information changed — refresh AI analysis.</p>}
    <p className="mt-3 text-xs text-slate-500">{resumeStatus === 'extracted' ? 'Extracted professional resume text included; personal sections omitted.' : resumeStatus === 'not_uploaded' ? 'No resume uploaded; profile evidence is available.' : ['unreadable', 'no_usable_text'].includes(resumeStatus) ? 'Resume text could not be extracted. AI uses profile evidence only; scanned PDFs need a text-based version.' : 'Resume text will be checked when you generate analysis.'} PDF layout and ATS formatting have not been analyzed.</p>
    <button type="button" disabled={busy || !onGenerate} onClick={onGenerate} className="mt-3 rounded-lg bg-blue-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Analyzing…' : assessment ? 'Refresh AI Analysis' : 'Generate AI Analysis'}</button>
    {busy && <p role="status" className="mt-2 text-sm text-blue-900">{match ? 'Analyzing role fit with local AI…' : 'Analyzing profile and resume with local AI…'} Your previous result stays visible. CPU analysis may take up to three minutes.</p>}
    {error && <p role="status" className="mt-3 text-sm text-slate-600">{error} Your objective score and previous successful AI result remain available.</p>}
  </div>
}

export function StudentInsightView({ data, match = false, error = '', busy = false, assessmentError = '', onGenerate }) {
  const deterministic = data?.deterministic
  return <section aria-label={match ? 'AI Job Match' : 'AI Career Assistant'} className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-blue-700">Placement intelligence</p><h2 className="mt-1 font-bold text-slate-950">{match ? 'AI Job Match' : 'AI Career Assistant'}</h2></div>{deterministic && <div className="text-sm font-bold text-blue-900">{match ? <>Objective Match: <MatchBadge score={deterministic.score} label={deterministic.label} /></> : <>Student Profile Score: {deterministic.score}/100</>}</div>}</div>
    <p className="mt-2 text-xs text-slate-500">{match ? 'Professional match is advisory. Official eligibility and Apply are separate.' : 'Objective score uses documented professional profile evidence and resume availability.'}</p>
    {!deterministic && !error && <p role="status" className="mt-4 text-sm text-slate-600">Loading professional evidence…</p>}
    {error && <p role="status" className="mt-4 text-sm text-slate-600">{error}</p>}
    {deterministic && <>
      {!match && deterministic.breakdown?.length > 0 && <div className="mt-4"><h3 className="text-sm font-bold text-slate-900">Objective Profile Score breakdown</h3><p className="mt-1 text-xs text-slate-500">Backend dimension scores add exactly to your Student Profile Score.</p><dl className="mt-2 grid gap-x-6 sm:grid-cols-2">{deterministic.breakdown.map(row => <div key={row.key} className="flex justify-between gap-3 border-b border-slate-100 py-2 text-sm"><dt className="text-slate-600">{row.label}</dt><dd className="shrink-0 font-bold tabular-nums text-blue-900">{row.earnedPoints}/{row.maximum}</dd></div>)}</dl></div>}
      {deterministic.score === null ? <p className="mt-4 text-sm text-slate-600">{deterministic.reason}</p> : <div className="mt-4 grid gap-4 sm:grid-cols-2">{match ? <><EvidenceList title="Matched skills" items={deterministic.matchedSkills} /><EvidenceList title="Not documented" items={deterministic.missingSkills} /><EvidenceList title="Project / experience evidence" items={(deterministic.evidence ?? []).map(item => `${item.title}: ${item.skills.join(', ')}`)} /><EvidenceList title="Needs supporting evidence" items={deterministic.weakerEvidence} /></> : <><EvidenceList title="Improvement areas" items={deterministic.improvementAreas} /><EvidenceList title="Suitable roles to explore" items={deterministic.suitableRoles} /><EvidenceList title="Next learning steps" items={deterministic.nextLearningSteps} /><EvidenceList title="Profile / resume suggestions" items={deterministic.profileSuggestions} /></>}</div>}
      <AiAssessmentView assessment={data.assessment} match={match} busy={busy} error={assessmentError || (data.ai?.status === 'unavailable' ? `Local AI is temporarily unavailable (${data.ai.reason ?? 'unavailable'}). Please try again later.` : '')} onGenerate={onGenerate} resumeStatus={data.assessment?.stale ? 'not_analyzed' : data.resumeStatus} />
    </>}
  </section>
}

function CurrentStudentIntelligence({ token, driveId, revision, cycleId, load = getStudentIntelligence, ask = askStudentIntelligence, assess = assessStudentIntelligence }) {
  const [state, setState] = useState({ data: null, error: '', busy: false, assessmentError: '' })
  const generation = useRef(null)
  const onAsk = useCallback((question, signal) => ask(token, { driveId, question, signal }), [ask, token, driveId])
  useEffect(() => {
    const controller = new AbortController(); let live = true
    load(token, { driveId, signal: controller.signal }).then(({ data }) => {
      if (live && activePlacementCycle() === cycleId) setState(current => ({ ...current, data, error: '' }))
    }).catch(() => { if (live && !controller.signal.aborted) setState(current => ({ ...current, error: 'Placement intelligence is temporarily unavailable. Normal placement actions remain available.' })) })
    return () => { live = false; controller.abort() }
  }, [token, driveId, revision, cycleId, load])
  useEffect(() => () => generation.current?.abort(), [])
  const generate = async () => {
    if (generation.current) return
    const controller = new AbortController(); generation.current = controller
    setState(current => ({ ...current, busy: true, assessmentError: '' }))
    try {
      const { data } = await assess(token, { driveId, signal: controller.signal })
      if (!controller.signal.aborted && activePlacementCycle() === cycleId) setState(current => ({ ...current, data: data.ai?.status === 'unavailable' && !data.assessment && current.data?.assessment ? { ...data, assessment: { ...current.data.assessment, stale: true } } : data, busy: false }))
    } catch {
      if (!controller.signal.aborted && activePlacementCycle() === cycleId) setState(current => ({ ...current, busy: false, assessmentError: 'Local AI analysis could not be refreshed. Please try again later.' }))
    } finally { if (generation.current === controller) generation.current = null }
  }
  return <div className="space-y-3"><StudentInsightView {...state} match={Boolean(driveId)} onGenerate={generate} /><ContextualAskAi title={driveId ? 'Ask AI about this role' : 'Ask AI about your preparation'} questions={driveId ? matchQuestions : careerQuestions} onAsk={onAsk} /></div>
}
export function StudentIntelligence({ token, driveId, revision, load, ask, assess }) {
  const { cycle } = usePlacementCycle()
  if (cycle.id !== '2027') return null
  return <CurrentStudentIntelligence key={`${cycle.id}:${token}:${driveId ?? 'career'}`} token={token} driveId={driveId} revision={revision} cycleId={cycle.id} load={load} ask={ask} assess={assess} />
}
