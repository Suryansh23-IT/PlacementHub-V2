import {useEffect,useRef,useState} from 'react'
import {usePlacementCycle} from '../placement-cycle/usePlacementCycle.js'
import {activePlacementCycle} from '../placement-cycle/placement-cycle.js'
import * as api from '../../services/company-ai.service.js'
import { FRONTEND_RUNTIME } from '../placement-cycle/placement-cycle.js'

export function useCompanyExplorerAi(token, rows, provider = api) {
  const { cycle } = usePlacementCycle(); const enabled = cycle.id === '2027'; const [records, setRecords] = useState({}); const [selected, setSelected] = useState([]); const [limits, setLimits] = useState({ batch: 4, group: 4 }); const [job, setJob] = useState(null); const [error, setError] = useState(''); const starting = useRef(false)
  const signature = rows.filter(row => row.aiAvailable !== false).map(row => `${row.driveId}:${row.studentId}`).join('|')
  const semanticEnabled = enabled && FRONTEND_RUNTIME.aiEnabled && !Object.values(records).some(row => row.ai?.reason === 'disabled')
  useEffect(() => {
    if (!enabled || !FRONTEND_RUNTIME.aiEnabled || !signature) return
    const controller = new AbortController()
    provider.getCompanyAiOverview(token, signature.split('|').map(value => { const [driveId, studentId] = value.split(':'); return { driveId, studentId } }), controller.signal).then(({ data }) => { if (!controller.signal.aborted) { setRecords(Object.fromEntries(data.records.map(row => [row.applicationId, row]))); setLimits(data.limits); setError('') } }).catch(() => { if (!controller.signal.aborted) setError('AI status is unavailable; objective matches and normal candidate actions remain usable.') })
    return () => controller.abort()
  }, [enabled, token, signature, provider, rows.length])
  const jobId = job?.id; const jobDriveId = job?.driveId; const jobStatus = job?.status
  useEffect(() => {
    if (!semanticEnabled || !jobId || jobStatus === 'completed') return
    const controller = new AbortController(); let timer
    const poll = async () => {
      try {
        const { data } = await provider.pollCompanyAiBatch(token, jobDriveId, jobId, controller.signal)
        if (controller.signal.aborted) return
        setJob(data); setRecords(previous => ({ ...previous, ...Object.fromEntries(data.items.filter(row => row.result).map(row => [row.result.applicationId, row.result])) }))
        if (data.status !== 'completed') timer = setTimeout(poll, 5000)
      } catch (err) { if (!controller.signal.aborted) { if (err.statusCode === 404) { setError('This AI batch has expired. Start analysis again; candidate actions remain usable.'); setJob(null) } else { setError('AI progress is temporarily unavailable; completed results remain available.'); timer = setTimeout(poll, 15000) } } }
    }
    timer = setTimeout(poll, 1000)
    return () => { controller.abort(); clearTimeout(timer) }
  }, [semanticEnabled, jobId, jobDriveId, jobStatus, provider, token])
  function toggle(row) {
    if (!semanticEnabled || row.aiAvailable === false) return
    setSelected(previous => previous.some(item => item.id === row.id) ? previous.filter(item => item.id !== row.id) : previous.length < limits.batch && (!previous.length || previous[0].driveId === row.driveId) ? [...previous, row] : previous)
  }
  async function start(candidates = selected) {
    if (!Array.isArray(candidates)) candidates = selected
    if (!semanticEnabled || starting.current || !candidates.length || candidates.some(row => row.aiAvailable === false) || job && job.status !== 'completed') return
    starting.current = true; setError('')
    try { const { data } = await provider.startCompanyAiBatch(token, candidates[0].driveId, candidates.map(row => row.studentId)); if (activePlacementCycle() === '2027') setJob(data) } catch (err) { setError(err.message || 'Could not start AI batch.') } finally { starting.current = false }
  }
  return { enabled, semanticEnabled, records, selected, limits, job, error, toggle, start, provider }
}
