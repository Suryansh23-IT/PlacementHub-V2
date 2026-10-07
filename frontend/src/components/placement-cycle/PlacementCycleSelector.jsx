import { usePlacementCycle } from '../../features/placement-cycle/usePlacementCycle.js'

export function PlacementCycleSelector({ compact = false }) {
  const { activeCycle, cycles, setActiveCycle } = usePlacementCycle()
  return <fieldset className={compact ? 'flex items-center gap-1' : 'mt-6'} aria-label="Placement cycle">
    {!compact && <legend className="mb-2 text-sm font-bold text-slate-800">Placement Cycle</legend>}
    <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
      {cycles.map(cycle => <button key={cycle.id} type="button" onClick={() => setActiveCycle(cycle.id)} className={`rounded-lg px-3 py-2 text-left text-sm transition ${activeCycle === cycle.id ? 'bg-blue-800 font-bold text-white shadow-sm' : 'font-semibold text-slate-600 hover:bg-white hover:text-slate-950'}`} aria-pressed={activeCycle === cycle.id}>
        <span>{cycle.id}</span>{!compact && <span className={`ml-1.5 text-xs ${activeCycle === cycle.id ? 'text-blue-100' : 'text-slate-400'}`}>· {cycle.status}</span>}
      </button>)}
    </div>
  </fieldset>
}
