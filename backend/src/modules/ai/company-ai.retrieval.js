import { safeProfessionalText } from './ai.context.js'

const stop = new Set('who has have the strongest documented experience candidates candidate find with and evidence which compare top relevant for this role should i inspect work backend people skills are best available based on in a an of me'.split(' '))
export function retrieveCandidates(rows, question, limit = 4) {
  const expanded = question.toLowerCase().replace(/\bmern\b/g, 'mongodb express react node').replace(/\bml\b|machine.learning/g, 'machine learning tensorflow pytorch scikit').replace(/\bbackend\b/g, 'backend api server node java database sql')
  const terms = [...new Set(expanded.match(/[a-z][a-z0-9+#.-]{1,}/g) ?? [])].filter(term => !stop.has(term))
  const ranked = rows.map(row => {
    const evidence = JSON.stringify(row.context.evidence.map(item => item.data)).toLowerCase() + (row.resume?.text ?? '').toLowerCase()
    return { ...row, relevance: terms.reduce((sum, term) => sum + (evidence.includes(term) ? 1 : 0), 0) }
  }).sort((a, b) => b.relevance - a.relevance || (b.objective.score ?? -1) - (a.objective.score ?? -1) || a.studentId.localeCompare(b.studentId))
  const specific = /\b(?:mern|ml|machine.learning|tensorflow|pytorch|react|sql)\b/i.test(question)
  const requested = question.match(/\b(?:top|strongest|compare)\s+(\d+)\b/i)?.[1]
  return (specific ? ranked.filter(row => row.relevance > 0) : ranked).slice(0, requested ? Math.max(1, Math.min(Number(requested), limit)) : limit)
}
export function compactCandidate(row, resume) {
  return { candidateId: row.studentId, name: safeProfessionalText(row.name, 100), objectiveMatch: row.objective.score,
    evidence: row.context.evidence.slice(0, 12).map(item => ({ type: item.type, ...Object.fromEntries(Object.entries(item.data).map(([key, value]) => [key, typeof value === 'string' ? safeProfessionalText(value, 220) : Array.isArray(value) ? value.slice(0, 10) : value])) })),
    resume: { status: resume?.status ?? 'not_analyzed', professionalExcerpt: safeProfessionalText(resume?.text, 650) },
  }
}
