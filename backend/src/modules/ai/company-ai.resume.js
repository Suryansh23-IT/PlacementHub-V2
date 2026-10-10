// A second domain-specific filter: cached Student professional text may include
// education, which must not influence Company semantic ranking or eligibility.
export function companyResumeEvidence(resume) {
  if (!resume || resume.status !== 'extracted') return resume
  const headings = /^(?:technical skills|skills|technical expertise|projects|academic projects|professional projects|experience|work experience|professional experience|internships?|certifications?|credentials|technical achievements|professional summary|summary|objective|career objective|profile)\s*[:|]?\s*$/i
  let academic = false
  const lines = []
  for (const line of resume.text.split('\n')) {
    if (/^(?:education|academic qualifications)\s*[:|]?\s*$/i.test(line)) { academic = true; continue }
    if (headings.test(line)) academic = false
    if (academic || /\b(?:cpi|cgpa|gpa|academic grades?|marks|backlogs?|roll number|student id|graduation year)\b/i.test(line)) continue
    lines.push(line)
  }
  const text = lines.join('\n').slice(0, 5000)
  return { ...resume, text, status: text.trim().length >= 40 ? 'extracted' : 'no_usable_text' }
}
