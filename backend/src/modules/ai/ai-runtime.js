import { assertAiRuntime } from './ai.guard.js'
import { AiProviderError } from './ai.errors.js'

// Operational state only; no identities, prompts or professional context.
export function createAiRuntime(config, { now = Date.now } = {}) {
  assertAiRuntime(config)
  let epoch = 0; let lastRecoveryAt = null
  const tasks = new Set(); const queues = new Set()
  const category = scope => scope.startsWith('admin:') ? 'admin' : scope.includes(':group') ? 'group' : scope.startsWith('company:') ? 'candidate' : scope.includes('drive') ? 'drive' : 'career'
  function reset(reason = 'cancelled') {
    epoch += 1; lastRecoveryAt = new Date(now()).toISOString()
    for (const task of tasks) task.cancel(reason)
    tasks.clear()
    for (const queue of queues) queue.cancel()
  }
  return {
    epoch: () => epoch,
    active: () => tasks.size,
    registerQueue(queue) { queues.add(queue) },
    reset,
    status() { const first = tasks.values().next().value; return { status: tasks.size ? 'BUSY' : 'IDLE', category: first?.category ?? null, runningMs: first ? Math.max(0, now() - first.startedAt) : 0, queued: [...queues].reduce((sum, queue) => sum + queue.count(), 0), lastRecoveryAt } },
    async run(scope, work) {
      const generation = epoch; const controller = new AbortController(); let rejectCancellation
      const cancelled = new Promise((resolve, reject) => { rejectCancellation = reject })
      const task = { category: category(scope), startedAt: now(), cancel(reason) { controller.abort(); rejectCancellation(new AiProviderError(reason)) } }
      tasks.add(task)
      // Independent watchdog settles even a provider that ignores AbortSignal.
      const timer = setTimeout(() => reset('timeout'), config.AI_TIMEOUT_MS + 1000)
      try {
        const result = await Promise.race([work(controller.signal, generation), cancelled])
        if (generation !== epoch) throw new AiProviderError('cancelled')
        return result
      } finally { clearTimeout(timer); controller.abort(); tasks.delete(task) }
    },
  }
}
