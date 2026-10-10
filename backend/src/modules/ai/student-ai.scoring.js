import { PROFILE_WEIGHTS, PROFILE_TARGETS, MATCH_WEIGHTS, SKILL_ALIASES, MATCH_LABELS, ROLE_EVIDENCE, STUDENT_SCORING_VERSION } from '../../config/ai-scoring.js'

export const normalizeSkill = value => SKILL_ALIASES[value.trim().toLowerCase()] ?? value.trim().toLowerCase()
const unique = values => [...new Set(values.filter(Boolean).map(normalizeSkill))].sort()
export function professionalSkills(context) {
  return unique(context.evidence.flatMap(entry => entry.type === 'skill' ? [entry.data.skill] : entry.type === 'project' ? entry.data.technologies : entry.type === 'experience' ? entry.data.skills : []))
}

export function calculateProfileStrength(context) {
  const rows = type => context.evidence.filter(entry => entry.type === type)
  const skills = professionalSkills(context)
  const projects = rows('project').filter(entry => entry.data.title && entry.data.description && entry.data.technologies.length)
  const experience = rows('experience').filter(entry => entry.data.role && entry.data.description && entry.data.skills.length)
  const credentials = rows('certification').filter(entry => entry.data.title && entry.data.issuer).length + rows('achievement').filter(entry => entry.data.title && entry.data.description).length
  const fractions = {
    skills: Math.min(skills.length / PROFILE_TARGETS.skills, 1), projects: Math.min(projects.length / PROFILE_TARGETS.projects, 1), experience: Math.min(experience.length / PROFILE_TARGETS.experience, 1),
    credentials: Math.min(credentials / PROFILE_TARGETS.credentials, 1), direction: (Boolean(context.targetRole) + Boolean(context.careerInterests.length)) / 2,
    introduction: (Boolean(context.professionalHeadline) + Boolean(context.about)) / 2,
    links: Math.min(((context.professionalPresence?.length ?? 0) + (context.codingPresence?.length ?? 0)) / PROFILE_TARGETS.links, 1), resume: Number(context.resumeAvailable),
  }
  const descriptions = { skills: 'Document up to five distinct technical skills.', projects: 'Add up to two projects with descriptions and technologies.', experience: 'Describe experience with its role, work and skills.', credentials: 'Add up to two certifications or technical achievements.', direction: 'Add a target role and professional career interests.', introduction: 'Add a professional headline and introduction.', links: 'Add professional or coding-profile links.', resume: 'Upload a current resume.' }
  const breakdown = Object.entries(PROFILE_WEIGHTS).map(([key, maximum]) => ({ key, maximum, points: Math.round(maximum * fractions[key] * 10) / 10, advice: descriptions[key] }))
  const score = Math.round(breakdown.reduce((sum, row) => sum + row.points, 0))
  const labels = { skills: 'Technical Skills', projects: 'Projects', experience: 'Experience', credentials: 'Credentials', direction: 'Career Direction', introduction: 'Professional Intro', links: 'Professional Links', resume: 'Resume Availability' }
  // Preserve the existing raw points and overall score. Allocate display rounding
  // by largest remainder (original dimension order breaks ties), so rows sum exactly.
  for (const row of breakdown) { row.label = labels[row.key]; row.earnedPoints = Math.floor(row.points) }
  const remaining = score - breakdown.reduce((sum, row) => sum + row.earnedPoints, 0)
  const roundingOrder = [...breakdown].sort((a, b) => (b.points - Math.floor(b.points)) - (a.points - Math.floor(a.points)))
  for (const row of roundingOrder.slice(0, remaining)) row.earnedPoints += 1
  const suitableRoles = ROLE_EVIDENCE.filter(rule => rule.skills.filter(skill => skills.includes(skill)).length >= rule.minimum).map(rule => rule.role).slice(0, 3)
  const strengths = breakdown.filter(row => row.points > 0).map(row => ({ text: `${row.key}: ${row.points}/${row.maximum} documented evidence points.` }))
  const improvementAreas = breakdown.filter(row => row.points < row.maximum).map(row => ({ text: row.advice }))
  return { score, scoringVersion: STUDENT_SCORING_VERSION, breakdown, strengths, improvementAreas, suitableRoles,
    nextLearningSteps: suitableRoles.length ? ['Choose a suggested role and build a project demonstrating its core skills.'] : ['Add technical skills and project evidence to receive grounded role suggestions.'],
    profileSuggestions: ['Keep resume claims aligned with your documented projects and experience. PDF wording and ATS formatting have not been analyzed.'] }
}

export function calculateDriveMatch(context) {
  const required = unique(context.drive?.requiredSkills ?? [])
  const preferred = unique(context.drive?.preferredSkills ?? []).filter(skill => !required.includes(skill))
  const allRequirements = unique([...required, ...preferred])
  if (!allRequirements.length) return { score: null, label: 'Insufficient requirements', reason: 'This drive has no structured skill requirements to calculate a professional match.', matchedSkills: [], missingSkills: [], evidence: [], scoringVersion: STUDENT_SCORING_VERSION }
  const skills = professionalSkills(context)
  const requiredMatched = required.filter(skill => skills.includes(skill)); const preferredMatched = preferred.filter(skill => skills.includes(skill))
  const supporting = context.evidence.filter(entry => ['project', 'experience'].includes(entry.type) && (entry.data.title || entry.data.role) && entry.data.description).map(entry => ({ id: entry.id, type: entry.type, title: entry.data.title || entry.data.role, skills: unique(entry.data.technologies ?? entry.data.skills ?? []).filter(skill => allRequirements.includes(skill)) })).filter(entry => entry.skills.length)
  const supported = unique(supporting.flatMap(entry => entry.skills))
  const dimensions = [
    { key: 'required', weight: required.length ? MATCH_WEIGHTS.required : 0, coverage: required.length ? requiredMatched.length / required.length : 0 },
    { key: 'preferred', weight: preferred.length ? MATCH_WEIGHTS.preferred : 0, coverage: preferred.length ? preferredMatched.length / preferred.length : 0 },
    { key: 'evidence', weight: MATCH_WEIGHTS.evidence, coverage: supported.length / allRequirements.length },
  ]
  // Missing student evidence is zero coverage, not an unavailable dimension.
  const denominator = dimensions.reduce((sum, dimension) => sum + dimension.weight, 0)
  const score = Math.round(100 * dimensions.reduce((sum, dimension) => sum + dimension.weight * dimension.coverage, 0) / denominator)
  return { score, label: MATCH_LABELS.find(rule => score >= rule.minimum).label, dimensions: dimensions.map(row => ({ ...row, normalizedWeight: 100 * row.weight / denominator })), matchedSkills: allRequirements.filter(skill => skills.includes(skill)), missingSkills: allRequirements.filter(skill => !skills.includes(skill)), weakerEvidence: allRequirements.filter(skill => skills.includes(skill) && !supported.includes(skill)), evidence: supporting, scoringVersion: STUDENT_SCORING_VERSION }
}
