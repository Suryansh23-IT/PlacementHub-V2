import { useEffect, useId, useRef, useState } from 'react'

// One independent question/answer slot. Domains own context and API authorization.
export function ContextualAskAi({ title, questions, onAsk }) {
  const inputId = useId()
  const [input, setInput] = useState('')
  const [latest, setLatest] = useState(null)
  const pending = useRef(null)
  useEffect(() => () => { pending.current?.abort() }, [])

  async function ask(question) {
    question = question.trim()
    if (!question || question.length > 500) return
    pending.current?.abort()
    const controller = new AbortController(); pending.current = controller
    setInput(question); setLatest({ question, loading: true })
    try {
      const { data } = await onAsk(question, controller.signal)
      if (!controller.signal.aborted && pending.current === controller) setLatest({ question, answer: data.ai.status === 'available' ? data.ai.analysis.answer : '', unavailable: data.ai.status !== 'available', reason: data.ai.reason })
    } catch (error) {
      if (!controller.signal.aborted && pending.current === controller) setLatest({ question, unavailable: true, reason: error.statusCode === 429 ? 'rate_limited' : undefined })
    }
  }

  return <section aria-label={title} className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
    <h2 className="font-bold text-slate-950">{title}</h2>
    <p className="mt-1 text-xs text-slate-500">One contextual question at a time. A new question replaces the previous answer.</p>
    <div className="mt-3 flex flex-wrap gap-2">{questions.slice(0, 4).map(question => <button type="button" key={question} onClick={() => ask(question)} className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs text-blue-900">{question}</button>)}</div>
    <form className="mt-3 flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); ask(input) }}>
      <label className="sr-only" htmlFor={inputId}>Your contextual question</label>
      <input id={inputId} value={input} onChange={event => setInput(event.target.value)} maxLength={500} required placeholder="Ask about the professional evidence shown above…" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
      <button type="submit" disabled={!input.trim()} className="rounded-lg bg-blue-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Ask AI</button>
    </form>
    {latest && <div aria-live="polite" className="mt-4 border-t border-slate-100 pt-3 text-sm">
      <p className="break-words font-semibold text-slate-900">You: {latest.question}</p>
      {latest.loading ? <p role="status" className="mt-2 text-slate-600">AI Coach: Preparing your answer…</p> : latest.unavailable ? <p role="status" className="mt-2 text-slate-600">AI Coach: {({ busy: 'AI is answering another request. Please try again shortly.', quota: 'AI provider has reached its usage limit. Please try again later.', cooldown: 'AI is briefly paused after a provider failure. Please try again shortly.', rate_limited: 'Too many AI requests. Please wait before asking again.', timeout: 'AI took too long to answer. Please try again later.', output_limit: 'AI could not finish a valid answer. Please try a shorter question later.', not_configured: 'AI is not configured for this cycle.', disabled: 'AI is disabled for this cycle.' })[latest.reason] ?? 'AI answer is temporarily unavailable.'} Your score and analysis above remain available.</p> : <p className="mt-2 whitespace-pre-wrap break-words text-slate-700">AI Coach: {latest.answer}</p>}
    </div>}
  </section>
}
